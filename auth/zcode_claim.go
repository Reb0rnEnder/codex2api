package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"
)

type ZcodePlanClaim struct {
	PlanID     string `json:"plan_id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	Code       int    `json:"code,omitempty"`
	HTTPStatus int    `json:"http_status,omitempty"`
}

type ZcodeClaimReport struct {
	Plans      []ZcodePlanClaim `json:"plans"`
	Quota      *ZcodeQuota      `json:"quota,omitempty"`
	QuotaError string           `json:"quota_error,omitempty"`
}

// ClaimZcodeOfferedPlans claims only IDs offered by this account's preview.
// A provider challenge is reported to the caller; it is never solved or retried automatically.
func ClaimZcodeOfferedPlans(ctx context.Context, client *http.Client, baseURL, token, deviceID, captchaParam, captchaRegion string) (*ZcodeClaimReport, error) {
	clientCopy := *client
	clientCopy.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	client = &clientCopy
	base := strings.TrimRight(baseURL, "/") + "/api/v1/zcode-plan/billing"
	request := func(method, endpoint string, body []byte, result any) (int, error) {
		req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
		if err != nil {
			return 0, err
		}
		req.Header = ZcodeHeaders(token, deviceID)
		req.Header.Set("User-Agent", "ZCode/3.17.1")
		req.Header.Set("X-Zcode-App-Version", "3.17.1")
		req.Header.Set("X-Request-Id", uuid.NewString())
		if method == http.MethodPost && captchaParam != "" {
			req.Header.Set("X-Aliyun-Captcha-Verify-Param", captchaParam)
			if captchaRegion != "" {
				req.Header.Set("X-Aliyun-Captcha-Verify-Region", captchaRegion)
			}
		}
		resp, err := client.Do(req)
		if err != nil {
			return 0, fmt.Errorf("Zcode plan request failed")
		}
		defer resp.Body.Close()
		if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(result) != nil {
			return resp.StatusCode, fmt.Errorf("Invalid Zcode plan response (HTTP %d)", resp.StatusCode)
		}
		return resp.StatusCode, nil
	}
	var preview struct {
		Code *int `json:"code"`
		Data struct {
			Plans []struct {
				PlanID   string `json:"plan_id"`
				Name     string `json:"name"`
				Priority int    `json:"priority"`
			} `json:"plans"`
		} `json:"data"`
	}
	status, err := request(http.MethodGet, base+"/preview?app_version=3.17.1&platform=darwin-x64", nil, &preview)
	if err != nil {
		return nil, err
	}
	if status != 200 || preview.Code == nil || *preview.Code != 0 {
		return nil, fmt.Errorf("Zcode plan preview failed (HTTP %d)", status)
	}
	sort.SliceStable(preview.Data.Plans, func(i, j int) bool { return preview.Data.Plans[i].Priority > preview.Data.Plans[j].Priority })
	report := &ZcodeClaimReport{Plans: []ZcodePlanClaim{}}
	seen := map[string]bool{}
	for _, plan := range preview.Data.Plans {
		if ctx.Err() != nil {
			return report, ctx.Err()
		}
		if plan.PlanID == "" || seen[plan.PlanID] {
			continue
		}
		seen[plan.PlanID] = true
		name := plan.Name
		if name == "" {
			name = plan.PlanID
		}
		outcome := ZcodePlanClaim{PlanID: plan.PlanID, Name: name, Status: "failed"}
		body, _ := json.Marshal(map[string]string{"plan_id": plan.PlanID})
		var result struct {
			Code *int `json:"code"`
		}
		status, claimErr := request(http.MethodPost, base+"/claim", body, &result)
		outcome.HTTPStatus = status
		if result.Code != nil {
			outcome.Code = *result.Code
		}
		if claimErr == nil && status == 200 && result.Code != nil && *result.Code == 0 {
			outcome.Status = "claimed"
		} else if claimErr == nil && (status == 200 || status == 401 || status == 403) && result.Code != nil && *result.Code == 1003 {
			outcome.Status = "already_claimed"
		} else if result.Code != nil && *result.Code == 3007 {
			outcome.Status = "captcha_required"
		}
		report.Plans = append(report.Plans, outcome)
	}
	report.Quota, err = FetchZcodeQuota(ctx, client, baseURL, token, deviceID)
	if err != nil {
		report.QuotaError = err.Error()
	}
	return report, nil
}
