package admin

import (
	"net/url"
	"testing"

	"github.com/codex2api/auth"
)

func TestBasisPointsCallbackValidation(t *testing.T) {
	valid := auth.BasisPointsRedirectURI + "?" + url.Values{"code": {"test-code"}, "state": {"bps.test.PC"}}.Encode()
	code, err := parseBasisPointsCallback(valid, "bps.test.PC")
	if err != nil || code != "test-code" {
		t.Fatal("valid callback rejected")
	}
	for _, raw := range []string{
		"https://evil.example/auth/callback?code=secret&state=bps.test.PC",
		auth.BasisPointsRedirectURI + "?code=secret&state=other",
		auth.BasisPointsRedirectURI + "?state=bps.test.PC",
		auth.BasisPointsRedirectURI + "?state=bps.test.PC&error=access_denied",
	} {
		if _, err := parseBasisPointsCallback(raw, "bps.test.PC"); err == nil {
			t.Error("invalid callback accepted")
		}
	}
}
