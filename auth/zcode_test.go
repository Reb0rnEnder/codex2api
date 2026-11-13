package auth

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestZcodeJWTValidation(t *testing.T) {
	token := func(exp int64) string {
		return "header." + base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"exp":%d}`, exp))) + ".signature"
	}
	if _, err := ZcodeTokenExpiry(token(time.Now().Add(time.Hour).Unix())); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"not-a-jwt", "header.invalid.signature", token(1)} {
		if _, err := ZcodeTokenExpiry(value); err == nil {
			t.Fatal("invalid or expired token accepted")
		}
	}
}

func TestZcodeStableDeviceAndSessionIdentity(t *testing.T) {
	first := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"user-1","exp":1900000000}`)) + ".sig"
	second := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"user-1","exp":1900000100}`)) + ".other"
	device := ZcodeDeviceID(first)
	if len(device) != 36 || device != ZcodeDeviceID(second) {
		t.Fatal("device identity changed across tokens for the same subject")
	}
	if session := ZcodeSessionID(device); len(session) != 40 || !strings.HasPrefix(session, "session_") {
		t.Fatal("incorrect Zcode session identity")
	}
}

func TestZcodeQuotaModelDiscovery(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/zcode-plan/billing/balance" || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("incorrect billing request")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"code":0,"data":{"plans":[{"name":"Start"}],"balances":[{"show_name":"GLM-5.3","remaining_units":10},{"show_name":"GLM-5.3-Flash","remaining_units":20},{"show_name":"Other entitlement"}]}}`)
	}))
	defer server.Close()
	q, err := FetchZcodeQuota(context.Background(), server.Client(), server.URL, "test-token", "device")
	if err != nil || len(q.Models) != 2 || q.Plan != "Start" {
		t.Fatalf("quota=%+v error=%v", q, err)
	}
}

func TestZcodeAccountReloadKeepsJWTExpiry(t *testing.T) {
	store, db, id, _ := codexRefreshFixture(t, func(http.ResponseWriter, *http.Request) { t.Fatal("Zcode must not use Codex OAuth refresh") })
	expiry := time.Now().Add(time.Hour).Truncate(time.Second)
	err := db.UpdateCredentials(context.Background(), id, map[string]any{"upstream_type": UpstreamZcode, "zcode": "true", "zcode_device_id": "device", "refresh_token": "", "claude_auth_kind": ClaudeAuthKindAPIKey, "expires_at": expiry.Format(time.RFC3339), "models": []string{"GLM-5.3"}})
	if err != nil {
		t.Fatal(err)
	}
	store.RemoveAccount(id)
	if err := store.LoadAccountByID(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	a := store.FindByID(id)
	if !a.IsZcode() || !a.IsClaudeAPIKey() || !a.ExpiresAt.Equal(expiry) || a.ZcodeDeviceID != "device" {
		t.Fatal("Zcode runtime state was not restored")
	}
	if a.NeedsUsageProbe(time.Second) || store.shouldBackgroundRefresh(a, false) {
		t.Fatal("Zcode admitted to an unrelated refresh/probe")
	}
}
