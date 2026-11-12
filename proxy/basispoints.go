package proxy

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/codex2api/auth"
	"github.com/google/uuid"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// Only account configuration selects this transport. Never infer it from a
// downstream header, URL, or model name.
func prepareBasisPointsWebsocket(baseURL, accessToken string, body []byte) (string, http.Header, []byte, error) {
	u, err := url.Parse(baseURL + "/responses")
	if err != nil {
		return "", nil, nil, err
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	clientInfo := map[string]string{}
	for key, values := range auth.BasisPointsClientHeaders() {
		if strings.HasPrefix(strings.ToLower(key), "x-openai-internal-basispoints-") {
			clientInfo[key] = values[0]
		}
	}
	info, err := json.Marshal(clientInfo)
	if err != nil {
		return "", nil, nil, err
	}
	q := u.Query()
	q.Set("bps_client_info", string(info))
	q.Set("bps_auth_mode", "chatgpt")
	q.Set("bps_ws_affinity", uuid.NewString())
	// Do not negotiate resumable requests: retrying a partially delivered turn
	// would duplicate output. Context cancellation closes the socket instead.
	q.Set("bps_control_frames", "upstream_sent,heartbeat")
	u.RawQuery = q.Encode()
	headers := make(http.Header)
	headers.Set("Origin", "https://bps.openai.com")
	headers.Set("Sec-WebSocket-Protocol", "responses, openai-bearer."+accessToken)
	body = prepareOpenAIResponsesWebsocketBody(body)
	body, _ = sjson.SetBytes(body, "basispoints_request_id", uuid.NewString())
	body, _ = sjson.SetBytes(body, "model_selection", "explicit")
	body, _ = sjson.SetBytes(body, "store", false)
	// The Office gateway requires these even for a plain text turn.
	body, _ = sjson.SetBytes(body, "metadata.task_id", uuid.NewString())
	body, _ = sjson.SetBytes(body, "metadata.turn_id", uuid.NewString())
	body, _ = sjson.SetBytes(body, "metadata.agent_iteration", "1")
	input := gjson.GetBytes(body, "input")
	if input.Type == gjson.String {
		body, _ = sjson.SetBytes(body, "input", []map[string]interface{}{{"type": "message", "role": "user", "content": []map[string]string{{"type": "input_text", "text": input.String()}}}})
	} else if input.IsArray() {
		for index, item := range input.Array() {
			if item.Get("role").Exists() && !item.Get("type").Exists() {
				body, _ = sjson.SetBytes(body, fmt.Sprintf("input.%d.type", index), "message")
			}
			if content := item.Get("content"); content.Type == gjson.String {
				contentType := "input_text"
				if item.Get("role").String() == "assistant" {
					contentType = "output_text"
				}
				body, _ = sjson.SetBytes(body, fmt.Sprintf("input.%d.content", index), []map[string]string{{"type": contentType, "text": content.String()}})
			}
		}
	}
	if effort := gjson.GetBytes(body, "reasoning.effort"); effort.Exists() {
		body, _ = sjson.SetBytes(body, "reasoning_effort", effort.String())
		body, _ = sjson.DeleteBytes(body, "reasoning")
	}
	return u.String(), headers, body, nil
}
