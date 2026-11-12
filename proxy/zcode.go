package proxy

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/codex2api/auth"
	"github.com/google/uuid"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

func zcodeNonStreamResponses(ctx context.Context, resp *http.Response) (*http.Response, error) {
	if resp == nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp, nil
	}
	defer resp.Body.Close()
	var result []byte
	err := readSSEStreamWithContinuousRetryKeepalive(ctx, resp.Body, func(_ string, data []byte) bool {
		switch gjson.GetBytes(data, "type").String() {
		case "response.completed", "response.incomplete", "response.failed":
			if response := gjson.GetBytes(data, "response"); response.IsObject() {
				result = []byte(response.Raw)
			}
			return false
		}
		return true
	})
	if err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, ErrUpstreamStreamBreak("Zcode stream ended before a terminal response")
	}
	resp.Body = io.NopCloser(bytes.NewReader(result))
	resp.Header.Set("Content-Type", "application/json")
	resp.ContentLength = int64(len(result))
	resp.Header.Del("Content-Length")
	return resp, nil
}

// The Zcode system blocks are from D3-vin/Zcode2Api.
// See third_party/Zcode2Api.LICENSE for the source license.
//
//go:embed zcode_system.json
var zcodeSystemJSON []byte

func prepareZcodeBody(body []byte, deviceID string) ([]byte, error) {
	if !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
		return nil, ErrBadRequest("Zcode request must be a JSON object")
	}
	var system []map[string]interface{}
	if err := json.Unmarshal(zcodeSystemJSON, &system); err != nil {
		return nil, err
	}
	var clientSystem []string
	sys := gjson.GetBytes(body, "system")
	if sys.Type == gjson.String {
		clientSystem = append(clientSystem, sys.String())
	} else {
		for _, b := range sys.Array() {
			if t := b.Get("text").String(); t != "" && !strings.HasPrefix(t, "x-anthropic-billing-header:") {
				clientSystem = append(clientSystem, t)
			}
		}
	}
	if len(clientSystem) > 0 {
		system[len(system)-1]["text"] = fmt.Sprint(system[len(system)-1]["text"]) + "\n\n" + strings.Join(clientSystem, "\n\n")
	}
	body, _ = sjson.SetBytes(body, "system", system)
	for i, m := range gjson.GetBytes(body, "messages").Array() {
		if content := m.Get("content"); content.Type == gjson.String {
			body, _ = sjson.SetBytes(body, fmt.Sprintf("messages.%d.content", i), []map[string]string{{"type": "text", "text": content.String()}})
		}
	}
	uid, _ := json.Marshal(map[string]string{"device_id": deviceID, "account_uuid": "", "session_id": auth.ZcodeSessionID(deviceID)})
	body, _ = sjson.SetBytes(body, "metadata.user_id", string(uid))
	if max := gjson.GetBytes(body, "max_tokens"); !max.Exists() {
		body, _ = sjson.SetBytes(body, "max_tokens", 8192)
	} else if max.Int() > 131072 {
		body, _ = sjson.SetBytes(body, "max_tokens", 131072)
	}
	if gjson.GetBytes(body, "thinking.type").String() == "adaptive" {
		body, _ = sjson.SetBytes(body, "thinking.type", "enabled")
	}
	switch gjson.GetBytes(body, "output_config.effort").String() {
	case "medium":
		body, _ = sjson.SetBytes(body, "output_config.effort", "high")
	case "xhigh", "extra":
		body, _ = sjson.SetBytes(body, "output_config.effort", "max")
	}
	return body, nil
}

func executeZcodeMessages(ctx context.Context, account *auth.Account, body []byte, proxyOverride string) (*http.Response, error) {
	account.Mu().RLock()
	token, deviceID, proxyURL := account.AccessToken, account.ZcodeDeviceID, account.ProxyURL
	expiry := account.ExpiresAt
	account.Mu().RUnlock()
	if token == "" {
		return nil, ErrNoAvailableAccount()
	}
	if !expiry.IsZero() && !expiry.After(time.Now()) {
		return nil, ErrUpstream(401, "Zcode session expired; sign in again", nil)
	}
	if deviceID == "" {
		deviceID = auth.ZcodeDeviceID(token)
	}
	for _, model := range account.CodexModels() {
		if strings.EqualFold(model, gjson.GetBytes(body, "model").String()) {
			body, _ = sjson.SetBytes(body, "model", model)
			break
		}
	}
	body, err := prepareZcodeBody(body, deviceID)
	if err != nil {
		return nil, err
	}
	if proxyOverride != "" {
		proxyURL = proxyOverride
	}
	proxyURL = requestProxyURL(ctx, proxyURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, auth.ZcodeBaseURL+"/api/v1/zcode-plan/anthropic/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header = auth.ZcodeHeaders(token, deviceID)
	for _, key := range []string{"X-Query-Id", "X-Request-Id", "X-Zcode-Trace-Id"} {
		req.Header.Set(key, uuid.NewString())
	}
	req.Header.Set("X-Session-Id", auth.ZcodeSessionID(deviceID))
	req.Header.Set("X-Zcode-Query-Source", "main_turn")
	req.Header.Set("X-Zcode-Session-Type", "main")
	if err := ConsumeAPIKeyModelRequestQuota(ctx, gjson.GetBytes(body, "model").String()); err != nil {
		return nil, err
	}
	client := *getRequestClient(ctx, account, proxyURL)
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	RecordUpstreamUserAgent(ctx, req.Header.Get("User-Agent"))
	resp, err := doTracedUpstreamRequest(&client, req, account, proxyURL)
	if err != nil {
		return nil, ErrUpstream(0, "Zcode request failed", err)
	}
	return resp, nil
}
