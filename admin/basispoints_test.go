package admin

import (
	"context"
	"net/url"
	"testing"

	"github.com/codex2api/auth"
	"github.com/codex2api/database"
)

func TestBasisPointsSamplingAndTestModel(t *testing.T) {
	row := &database.AccountRow{Credentials: map[string]interface{}{"basispoints": "true"}, Status: "active"}
	if accountListUnsampled(&accountListSnapshotItem{Row: row, Status: "active"}) || isDashboardUnsampledAccount(row, nil) {
		t.Fatal("BPS must not require Codex quota samples")
	}
	h, _, _ := newPagedAccountsHandler(t)
	h.store.SetTestModel("gpt-6-astra")
	account := &auth.Account{BasisPoints: true, Models: []string{"bps-available-model"}}
	model, err := h.connectionTestModelForAccount(context.Background(), account, "")
	if err != nil || model != "bps-available-model" {
		t.Fatalf("model=%s err=%v", model, err)
	}
	if got := localizeAdminError("en", "该账号不支持测试模型: gpt-6-astra"); got != "This account does not support test model: gpt-6-astra" {
		t.Fatal("untranslated connection error")
	}
}

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
