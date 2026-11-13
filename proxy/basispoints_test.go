package proxy

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/tidwall/gjson"
)

func TestBasisPointsWebsocketStream(t *testing.T) {
	resetOpenAIResponsesWebsocketPool()
	t.Cleanup(resetOpenAIResponsesWebsocketPool)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }, Subprotocols: []string{"responses"}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/basispoints/api/responses" || r.URL.Query().Get("bps_auth_mode") != "chatgpt" {
			t.Error("incorrect BasisPoints endpoint")
		}
		if r.Header.Get("Authorization") != "" || r.Header.Get("OpenAI-Beta") != "" || !strings.Contains(r.Header.Get("Sec-WebSocket-Protocol"), "openai-bearer.test-token") {
			t.Error("incorrect websocket authentication")
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		_, body, err := conn.ReadMessage()
		if err != nil {
			t.Error(err)
			return
		}
		if gjson.GetBytes(body, "reasoning_effort").String() != "high" || gjson.GetBytes(body, "reasoning").Exists() || gjson.GetBytes(body, "type").String() != "response.create" || gjson.GetBytes(body, "basispoints_request_id").String() == "" {
			t.Error("incorrect BasisPoints request adaptation")
		}
		if gjson.GetBytes(body, "metadata.task_id").String() == "" || gjson.GetBytes(body, "metadata.turn_id").String() == "" || gjson.GetBytes(body, "input.0.content.0.text").String() != "hello" {
			t.Error("missing BasisPoints turn metadata or input normalization")
		}
		for _, frame := range []string{
			`{"type":"basispoints.response.metadata","headers":{}}`,
			`{"type":"basispoints.response.upstream_sent"}`,
			`{"type":"response.output_text.delta","delta":"hello"}`,
			`{"type":"response.completed","response":{"id":"resp-bps","status":"completed"}}`,
		} {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(frame)); err != nil {
				return
			}
		}
	}))
	t.Cleanup(server.Close)
	wsURL, headers, body, err := prepareBasisPointsWebsocket(server.URL+"/basispoints/api", "test-token", []byte(`{"model":"test-model","input":"hello","reasoning":{"effort":"high"}}`))
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(wsURL)
	if strings.Contains(u.RawQuery, "test-token") {
		t.Fatal("token leaked to websocket query")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := openAIResponsesWebsocketPool.roundTrip(ctx, openAIResponsesWSSpec{accountID: 123, basisPoints: true, baseURL: server.URL, wsURL: wsURL, headers: headers}, body)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	stream, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(stream), "basispoints.") || !strings.Contains(string(stream), "hello") || !strings.Contains(string(stream), "response.completed") {
		t.Fatal("incorrect Responses stream")
	}
}

func TestBasisPointsPreservesCustomToolsAndCallerInstructions(t *testing.T) {
	request := []byte(`{"model":"test-model","instructions":"Only my application instructions","tools":[{"type":"function","name":"lookup_widget","description":"Find a widget","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}}],"tool_choice":{"type":"function","name":"lookup_widget"},"input":[{"type":"function_call","call_id":"call_test","name":"lookup_widget","arguments":"{\"id\":\"1\"}"},{"type":"function_call_output","call_id":"call_test","output":"widget found"},{"role":"user","content":"continue"}]}`)
	_, _, body, err := prepareBasisPointsWebsocket("https://bps.openai.com/basispoints/api", "synthetic", request)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"instructions", "tools", "tool_choice", "input.0", "input.1"} {
		if gjson.GetBytes(body, key).Raw != gjson.GetBytes(request, key).Raw {
			t.Fatalf("changed caller field %s", key)
		}
	}
	if gjson.GetBytes(body, "input.#").Int() != 3 {
		t.Fatal("unexpected Office instruction or tool message injected")
	}
	_, _, plain, err := prepareBasisPointsWebsocket("https://bps.openai.com/basispoints/api", "synthetic", []byte(`{"model":"test-model","input":"hello"}`))
	if err != nil || gjson.GetBytes(plain, "instructions").Exists() || gjson.GetBytes(plain, "tools").Exists() {
		t.Fatal("default Office prompt/tools injected")
	}
}
