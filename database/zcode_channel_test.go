package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestZcodeProviderIsSeparateAndMarkersSurviveProjection(t *testing.T) {
	db, err := New("sqlite", filepath.Join(t.TempDir(), "providers.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	for _, provider := range []string{"claude", "zcode", "codex"} {
		credentials := map[string]any{"upstream_type": provider, "access_token": "not-public", "refresh_token": "not-public", "models": []string{"GLM-5.3"}}
		if provider == "zcode" {
			credentials["zcode"] = "true"
		}
		if provider == "codex" {
			credentials["basispoints"] = "true"
			credentials["basispoints_access_checked_at"] = "2026-11-13T00:00:00Z"
		}
		if _, err := db.InsertAccountWithCredentials(ctx, provider, credentials, ""); err != nil {
			t.Fatal(err)
		}
	}
	for _, provider := range []string{"claude", "zcode", "codex"} {
		full, err := db.ListActiveByChannel(ctx, provider)
		if err != nil || len(full) != 1 || full[0].Name != provider {
			t.Fatalf("full provider=%s rows=%d err=%v", provider, len(full), err)
		}
		rows, err := db.ListAccountListProjection(ctx, provider)
		if err != nil || len(rows) != 1 || rows[0].Name != provider {
			t.Fatalf("projection provider=%s rows=%d err=%v", provider, len(rows), err)
		}
		row := rows[0]
		if row.GetCredential("access_token") != "" || row.GetCredential("refresh_token") == "not-public" {
			t.Fatal("credentials leaked into projection")
		}
		if provider == "zcode" && row.GetCredential("zcode") != "true" {
			t.Fatal("missing Zcode marker")
		}
		if provider == "codex" && (row.GetCredential("basispoints") != "true" || row.GetCredential("basispoints_access_checked_at") == "") {
			t.Fatal("missing BasisPoints metadata")
		}
	}
}
