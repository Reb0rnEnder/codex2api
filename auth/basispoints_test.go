package auth

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestBasisPointsRefreshPersistsAndReloads(t *testing.T) {
	store, db, id, _ := codexRefreshFixture(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		if r.Form.Get("client_id") != BasisPointsClientID || r.Form.Get("grant_type") != "refresh_token" || r.Form.Get("refresh_token") != "old-rt" {
			t.Error("refresh did not use the BasisPoints OAuth form")
		}
		if r.Header.Get("X-Basispoints-Auth-Mode") != "chatgpt" || r.Header.Get("Originator") != "" {
			t.Error("incorrect refresh identity")
		}
		writeCodexRefreshedTokens(w)
	})
	ctx := context.Background()
	decorate := ResinRequestDecorator
	ResinRequestDecorator = func(target, accountID string) string {
		if target != BasisPointsTokenURL {
			t.Error("refresh did not use the unified BasisPoints token endpoint")
		}
		return decorate(target, accountID)
	}
	if err := db.UpdateCredentials(ctx, id, map[string]any{"basispoints": "true", "models": []string{"test-model"}}); err != nil {
		t.Fatal(err)
	}
	store.RemoveAccount(id)
	if err := store.LoadAccountByID(ctx, id); err != nil {
		t.Fatal(err)
	}
	a := store.FindByID(id)
	if !a.IsBasisPoints() || !a.IsOpenAIResponsesAPI() || !a.OpenAIResponsesUsesUpstreamWebsocket() {
		t.Fatal("BasisPoints transport was not restored")
	}
	if !store.shouldBackgroundRefresh(a, true) || !store.lazyNeedsDispatchRefresh(a) {
		t.Fatal("renewable account excluded from refresh")
	}
	if a.NeedsUsageProbe(time.Second) {
		t.Fatal("BasisPoints must not call Codex WHAM")
	}
	if err := store.RefreshSingle(ctx, id); err != nil {
		t.Fatal(err)
	}
	base, token := a.OpenAIResponsesCredentials()
	if base != BasisPointsBaseURL || token != "new-at" {
		t.Fatal("transport did not pick up rotated token")
	}
	row, err := db.GetAccountByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if row.GetCredential("refresh_token") != "new-rt" || row.GetCredential("basispoints") != "true" {
		t.Fatal("rotation was not persisted")
	}
	store.RemoveAccount(id)
	if err := store.LoadAccountByID(ctx, id); err != nil {
		t.Fatal(err)
	}
	_, token = store.FindByID(id).OpenAIResponsesCredentials()
	if token != "new-at" {
		t.Fatal("reloaded account lost rotated credentials")
	}
}

func TestBasisPointsLoginURL(t *testing.T) {
	u, err := url.Parse(BasisPointsAuthorizeURL("bps.test.PC", "verifier"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(u.String(), BasisPointsExtensionURL+"/auth/start?") || u.Query().Get("platform") != "PC" || u.Query().Get("state") != "bps.test.PC" || u.Query().Get("code_challenge") != basisPointsCodeChallenge("verifier") {
		t.Fatal("incorrect Office login parameters")
	}
}
