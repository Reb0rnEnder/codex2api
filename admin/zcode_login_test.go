package admin

import (
	"context"
	"github.com/codex2api/auth"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestZcodeLoginPublicTransport(t *testing.T) {
	if os.Getenv("ZCODE_LOGIN_LIVE_TEST") != "1" {
		t.Skip("explicit opt-in; starts only an unauthenticated login flow")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	token, err := oauthRandomHex(32)
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		Data struct {
			FlowID       string `json:"flow_id"`
			AuthorizeURL string `json:"authorize_url"`
		} `json:"data"`
	}
	if err := zcodeJSON(ctx, http.MethodPost, auth.ZcodeBaseURL+"/api/v1/oauth/cli/init", token, "", `{"provider":"zai"}`, &response); err != nil {
		t.Fatal(err)
	}
	if response.Data.FlowID == "" || response.Data.AuthorizeURL == "" {
		t.Fatal("login endpoint did not return an authorization flow")
	}
	t.Log("Zcode returned a browser authorization flow; identifiers omitted")
}
