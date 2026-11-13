package admin

import (
	"context"
	"encoding/base64"
	"reflect"
	"strings"
	"testing"

	"github.com/codex2api/auth"
	"github.com/codex2api/database"
)

func TestZcodeConnectionModelsAndProviderIsolation(t *testing.T) {
	h, _, _ := newPagedAccountsHandler(t)
	ctx := context.Background()
	h.channelTestCfg.Store(&database.ChannelTestConfig{Claude: database.ChannelTestSettings{TestModel: "claude-sonnet-4-6", TestContent: "Claude only"}})
	account := &auth.Account{Zcode: true, UpstreamType: auth.UpstreamZcode, Models: []string{"GLM-5.3-Flash", "GLM-5.3", "claude-sonnet-4-6"}}
	for _, requested := range []string{"GLM-5.3-Flash", "glm-5.3-flash"} {
		model, err := h.connectionTestModelForAccount(ctx, account, requested)
		if err != nil || model != "GLM-5.3-Flash" {
			t.Fatalf("requested=%q model=%q err=%v", requested, model, err)
		}
	}
	if model, err := h.connectionTestModelForAccount(ctx, account, ""); err != nil || model != "GLM-5.3" {
		t.Fatalf("automatic model=%q err=%v", model, err)
	}
	if _, err := h.connectionTestModelForAccount(ctx, account, "claude-sonnet-4-6"); err == nil || !strings.Contains(err.Error(), "Zcode") {
		t.Fatal("unrelated test model accepted or mislabeled")
	}
	if got := h.channelTestSettingsForAccount(ctx, account); got.TestModel != "" || got.TestContent != "" {
		t.Fatal("Zcode inherited Claude channel settings")
	}
	if got := h.qualityTestOptionsForAccount(ctx, account).Models; !reflect.DeepEqual(got, []string{"GLM-5.3", "GLM-5.3-Flash"}) {
		t.Fatalf("quality/model probe options dropped GLM models: %v", got)
	}
	account.Models = nil
	if models := claudeProbeModelIDs(account); len(models) != 0 {
		t.Fatalf("Zcode fell back to unrelated models: %v", models)
	}
}

func TestZcodeEmailInListAndDetails(t *testing.T) {
	h, _, _ := newPagedAccountsHandler(t)
	token := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"email":"fixture@example.test"}`)) + ".signature"
	row := &database.AccountRow{ID: 123, Credentials: map[string]interface{}{"upstream_type": auth.UpstreamZcode, "zcode": "true", "access_token": token}}
	if got := h.buildAccountResponse(row, nil, nil, nil, nil, true); got.Email != "fixture@example.test" || !got.Zcode || got.ClaudeAPI {
		t.Fatalf("wrong detail identity: email=%q zcode=%v claude=%v", got.Email, got.Zcode, got.ClaudeAPI)
	}
	if got := h.buildAccountListSnapshotItem(row, nil, nil, nil, nil); got.Email != "fixture@example.test" {
		t.Fatalf("email missing from list: %q", got.Email)
	}
	row.Credentials["email"] = "login@example.test"
	if got := h.buildAccountResponse(row, nil, nil, nil, nil, true); got.Email != "login@example.test" {
		t.Fatal("sign-in email must take priority over token metadata")
	}
}
