package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestZcodeClaimEveryOfferedPlan(t *testing.T) {
	var claimed []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" || r.Header.Get("X-Device-Mid") != "device" {
			t.Error("wrong account identity")
		}
		switch r.URL.Path {
		case "/api/v1/zcode-plan/billing/preview":
			if r.Method != "GET" || r.URL.Query().Get("platform") != "darwin-x64" {
				t.Error("bad preview")
			}
			fmt.Fprint(w, `{"code":0,"data":{"plans":[{"plan_id":"low","priority":1},{"plan_id":"owned","priority":3},{"plan_id":"high","priority":8},{"plan_id":"captcha","priority":2},{"plan_id":"denied","priority":1},{"plan_id":"high","priority":0}]}}`)
		case "/api/v1/zcode-plan/billing/claim":
			if r.Method != "POST" || r.Header.Get("X-Aliyun-Captcha-Verify-Param") != "official-result" {
				t.Error("bad claim")
			}
			var input struct {
				PlanID string `json:"plan_id"`
			}
			json.NewDecoder(r.Body).Decode(&input)
			claimed = append(claimed, input.PlanID)
			switch input.PlanID {
			case "owned":
				fmt.Fprint(w, `{"code":1003}`)
			case "captcha":
				w.WriteHeader(403)
				fmt.Fprint(w, `{"code":3007}`)
			case "denied":
				w.WriteHeader(500)
				fmt.Fprint(w, `{"code":0}`)
			default:
				fmt.Fprint(w, `{"code":0}`)
			}
		case "/api/v1/zcode-plan/billing/balance":
			fmt.Fprint(w, `{"code":0,"data":{"plans":[{"name":"Start"}],"balances":[{"show_name":"GLM-5.3"}]}}`)
		default:
			t.Errorf("unexpected endpoint: %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	report, err := ClaimZcodeOfferedPlans(context.Background(), server.Client(), server.URL, "test-token", "device", "official-result", "cn")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(claimed, []string{"high", "owned", "captcha", "low", "denied"}) {
		t.Fatalf("claims=%v", claimed)
	}
	var statuses []string
	for _, plan := range report.Plans {
		statuses = append(statuses, plan.Status)
	}
	if !reflect.DeepEqual(statuses, []string{"claimed", "already_claimed", "captcha_required", "claimed", "failed"}) {
		t.Fatalf("statuses=%v", statuses)
	}
	if report.Quota == nil || len(report.Quota.Models) != 1 {
		t.Fatal("billing was not refreshed")
	}
}

func TestZcodeClaimRejectsInvalidPreviewAndMalformedSuccess(t *testing.T) {
	for _, invalidPreview := range []bool{true, false} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/api/v1/zcode-plan/billing/preview":
				if invalidPreview {
					fmt.Fprint(w, `{}`)
				} else {
					fmt.Fprint(w, `{"code":0,"data":{"plans":[{"plan_id":"offered"}]}}`)
				}
			case "/api/v1/zcode-plan/billing/claim":
				if invalidPreview {
					t.Error("claim after invalid preview")
				}
				fmt.Fprint(w, `{}`)
			default:
				fmt.Fprint(w, `{"code":0,"data":{"balances":[]}}`)
			}
		}))
		report, err := ClaimZcodeOfferedPlans(context.Background(), server.Client(), server.URL, "test-token", "device", "", "")
		server.Close()
		if invalidPreview {
			if err == nil {
				t.Fatal("invalid preview accepted")
			}
			continue
		}
		if err != nil || report.Plans[0].Status != "failed" || report.Quota == nil {
			t.Fatalf("report=%+v err=%v", report, err)
		}
	}
}

func TestZcodeClaimDoesNotFollowRedirect(t *testing.T) {
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("redirect followed") }))
	defer destination.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	if _, err := ClaimZcodeOfferedPlans(context.Background(), origin.Client(), origin.URL, "secret", "device", "", ""); err == nil {
		t.Fatal("redirect accepted")
	}
}
