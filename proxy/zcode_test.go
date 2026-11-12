package proxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/codex2api/auth"
	"github.com/codex2api/config"
	"github.com/codex2api/database"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

func TestZcodeNativeAndOpenAIHandlers(t *testing.T) {
	t.Setenv("CODEX_TRANSPORT_MODE", "standard")
	for _, protocol := range []string{"messages", "chat", "responses"} {
		for _, stream := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/stream=%t", protocol, stream), func(t *testing.T) {
				db, err := database.New("sqlite", filepath.Join(t.TempDir(), "zcode.db"))
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				store := auth.NewStore(db, nil, &database.SystemSettings{MaxConcurrency: 2, MaxRetries: 0})
				defer store.Stop()
				a := &auth.Account{DBID: 994812, Zcode: true, ZcodeDeviceID: "test-device", UpstreamType: auth.UpstreamClaude, ClaudeAuthKind: auth.ClaudeAuthKindAPIKey, AccessToken: "test-jwt", ExpiresAt: time.Now().Add(time.Hour), Models: []string{"GLM-5.3"}, Status: auth.StatusReady}
				store.AddAccount(a)
				calls := 0
				installClaudeBoundaryTransport(t, a, func(r *http.Request) (*http.Response, error) {
					calls++
					if r.URL.String() != auth.ZcodeBaseURL+"/api/v1/zcode-plan/anthropic/v1/messages" || r.Header.Get("Authorization") != "Bearer test-jwt" || r.Header.Get("X-Api-Key") != "test-jwt" || !strings.HasPrefix(r.UserAgent(), "ZCode/") {
						t.Error("incorrect Zcode transport")
					}
					body, _ := io.ReadAll(r.Body)
					if gjson.GetBytes(body, "system.#").Int() != 3 || gjson.GetBytes(body, "model").String() != "GLM-5.3" || strings.Contains(string(body), claudeCodeSystemPreamble) {
						t.Error("incorrect Zcode body or Claude identity leak")
					}
					payload := strings.ReplaceAll(claudeAPIKeyTestStream, "claude-sonnet-4-5", "GLM-5.3")
					contentType := "text/event-stream"
					if !gjson.GetBytes(body, "stream").Bool() {
						payload = strings.ReplaceAll(claudeAPIKeyTestResponse, "claude-sonnet-4-5", "GLM-5.3")
						contentType = "application/json"
					}
					return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {contentType}}, Body: io.NopCloser(strings.NewReader(payload))}, nil
				})
				h := NewHandler(store, db, &config.Config{AllowAnonymousV1: true}, nil)
				body := `{"model":"GLM-5.3","messages":[{"role":"user","content":"hello"}],"max_tokens":100,"stream":true}`
				if protocol == "responses" {
					body = `{"model":"GLM-5.3","input":"hello","stream":true}`
				}
				if !stream {
					body = strings.ReplaceAll(body, `"stream":true`, `"stream":false`)
				}
				recorder := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(recorder)
				c.Request = httptest.NewRequest(http.MethodPost, "/v1/"+protocol, strings.NewReader(body))
				switch protocol {
				case "messages":
					h.Messages(c)
				case "chat":
					h.ChatCompletions(c)
				case "responses":
					h.Responses(c)
				}
				if calls != 1 || recorder.Code != 200 || !strings.Contains(recorder.Body.String(), "call_2") {
					t.Fatalf("protocol=%s calls=%d status=%d body=%s", protocol, calls, recorder.Code, recorder.Body.String())
				}
			})
		}
	}
}

func TestZcodeModelIsolationAndBody(t *testing.T) {
	a := &auth.Account{Zcode: true, UpstreamType: auth.UpstreamClaude, Models: []string{"GLM-5.3"}}
	if !claudeAccountSupportsModel(a, "glm-5.3") || claudeAccountSupportsModel(a, "claude-sonnet-4-5") {
		t.Fatal("Zcode model isolation failed")
	}
	if claudeAccountSupportsModel(&auth.Account{UpstreamType: auth.UpstreamClaude}, "GLM-5.3") {
		t.Fatal("GLM routed to Anthropic")
	}
	body, err := prepareZcodeBody([]byte(`{"model":"GLM-5.3","system":"Client rules","max_tokens":200000,"messages":[{"role":"user","content":"hello"}],"thinking":{"type":"adaptive"},"output_config":{"effort":"xhigh"}}`), "device")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gjson.GetBytes(body, "system.2.text").String(), "Client rules") || gjson.GetBytes(body, "max_tokens").Int() != 131072 || gjson.GetBytes(body, "messages.0.content.0.text").String() != "hello" || gjson.GetBytes(body, "thinking.type").String() != "enabled" || gjson.GetBytes(body, "output_config.effort").String() != "max" {
		t.Fatal("body adaptation failed")
	}
	_, err = executeZcodeMessages(context.Background(), &auth.Account{AccessToken: "test", ExpiresAt: time.Now().Add(-time.Hour)}, []byte(`{}`), "")
	if err == nil {
		t.Fatal("expired JWT dispatched")
	}
}

func TestZcodeResponsesAdapterNonStream(t *testing.T) {
	t.Setenv("CODEX_TRANSPORT_MODE", "standard")
	a := &auth.Account{DBID: 994815, Zcode: true, UpstreamType: auth.UpstreamClaude, AccessToken: "test", Models: []string{"GLM-5.3"}}
	installClaudeBoundaryTransport(t, a, func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"text/event-stream"}}, Body: io.NopCloser(strings.NewReader(strings.ReplaceAll(claudeAPIKeyTestStream, "claude-sonnet-4-5", "GLM-5.3")))}, nil
	})
	resp, err := ExecuteOpenAIResponsesRequest(context.Background(), a, []byte(`{"model":"GLM-5.3","input":"hello","stream":false}`), "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if gjson.GetBytes(b, "status").String() != "completed" || resp.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("adapter did not return completed JSON: %s", b)
	}
}
