package zcodecaptcha

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCaptchaReadyRejectsDegradedResults(t *testing.T) {
	for _, n := range []int{0, 49, 50, 80} {
		b, _ := json.Marshal(map[string]any{"securityToken": strings.Repeat("t", n), "certifyId": "test", "isSign": true})
		if got := Ready(base64.StdEncoding.EncodeToString(b)); got != (n >= 50) {
			t.Fatalf("length=%d ready=%t", n, got)
		}
	}
	if Ready("not-base64") || Ready(base64.StdEncoding.EncodeToString([]byte(`{}`))) {
		t.Fatal("invalid param accepted")
	}
}

func TestLiveZcodeCaptcha(t *testing.T) {
	if os.Getenv("ZCODE_CAPTCHA_LIVE_TEST") != "1" {
		t.Skip("explicit opt-in only; no account credentials used")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 110*time.Second)
	defer cancel()
	p, region, err := Solve(ctx, &http.Client{Timeout: 15 * time.Second}, "https://zcode.z.ai")
	if err != nil {
		t.Fatal(err)
	}
	if !Ready(p) || region == "" {
		t.Fatal("no complete verification result")
	}
	t.Log("Complete verification result received; parameter omitted from logs")
}
