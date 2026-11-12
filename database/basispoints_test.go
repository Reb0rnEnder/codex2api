package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestBasisPointsIdentityDoesNotMergeIntoCodex(t *testing.T) {
	db, err := New("sqlite", filepath.Join(t.TempDir(), "basispoints.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	_, err = db.InsertAccountWithCredentials(ctx, "BasisPoints", map[string]any{
		"basispoints": "true", "upstream_type": "codex", "access_token": "bps-token",
		"email": "test@example.com", "workspace_id": "workspace",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.FindActiveAccountByOAuthRouteIdentity(ctx, "test@example.com", "workspace"); err != sql.ErrNoRows {
		t.Fatal("BasisPoints identity admitted to Codex deduplication")
	}
	id, err := db.InsertAccountWithCredentials(ctx, "Codex", map[string]any{
		"access_token": "codex-token", "email": "test@example.com", "workspace_id": "workspace",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	got, err := db.FindActiveAccountByOAuthRouteIdentity(ctx, "test@example.com", "workspace")
	if err != nil || got != id {
		t.Fatal("Codex identity no longer deduplicates")
	}
}
