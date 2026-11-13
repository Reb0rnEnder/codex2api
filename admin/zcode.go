package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/codex2api/auth"
	"github.com/codex2api/database"
	"github.com/codex2api/internal/zcodecaptcha"
	"github.com/codex2api/security"
	"github.com/gin-gonic/gin"
)

type zcodeLoginFlow struct {
	PollToken, FlowID, ProxyURL, Name string
	Created                           time.Time
}

var zcodeLoginFlows = struct {
	sync.Mutex
	Flows map[string]*zcodeLoginFlow
}{Flows: map[string]*zcodeLoginFlow{}}

func (h *Handler) zcodeChannelModels() []string {
	seen := map[string]bool{}
	models := []string{}
	for _, account := range h.store.Accounts() {
		if !account.IsZcode() {
			continue
		}
		for _, model := range account.CodexModels() {
			if !seen[strings.ToLower(model)] {
				seen[strings.ToLower(model)] = true
				models = append(models, model)
			}
		}
	}
	sort.Strings(models)
	return models
}

func zcodeJSON(ctx context.Context, method, endpoint, token, proxyURL, body string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	client := *auth.BuildHTTPClient(proxyURL)
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return auth.ZcodeConnectionError("sign-in", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("Zcode returned HTTP %d", resp.StatusCode)
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(result) != nil {
		return fmt.Errorf("Invalid Zcode response")
	}
	return nil
}

func (h *Handler) StartZcodeLogin(c *gin.Context) {
	var input struct {
		Name     string `json:"name"`
		ProxyURL string `json:"proxy_url"`
	}
	if c.ShouldBindJSON(&input) != nil {
		writeError(c, 400, "Invalid request")
		return
	}
	if err := security.ValidateProxyURL(input.ProxyURL); err != nil {
		writeError(c, 400, "Invalid proxy URL")
		return
	}
	pollToken, err := oauthRandomHex(32)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	id, err := oauthRandomHex(16)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	proxyURL := strings.TrimSpace(input.ProxyURL)
	if proxyURL == "" {
		proxyURL = h.store.GetProxyURL()
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	var response struct {
		Data struct {
			FlowID       string `json:"flow_id"`
			AuthorizeURL string `json:"authorize_url"`
		} `json:"data"`
	}
	if err := zcodeJSON(ctx, http.MethodPost, auth.ZcodeBaseURL+"/api/v1/oauth/cli/init", pollToken, proxyURL, `{"provider":"zai"}`, &response); err != nil {
		writeError(c, 502, err.Error())
		return
	}
	u, err := url.Parse(response.Data.AuthorizeURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || response.Data.FlowID == "" {
		writeError(c, 502, "Zcode did not return a valid sign-in URL")
		return
	}
	zcodeLoginFlows.Lock()
	for key, f := range zcodeLoginFlows.Flows {
		if time.Since(f.Created) > 5*time.Minute {
			delete(zcodeLoginFlows.Flows, key)
		}
	}
	zcodeLoginFlows.Flows[id] = &zcodeLoginFlow{PollToken: pollToken, FlowID: response.Data.FlowID, ProxyURL: proxyURL, Name: input.Name, Created: time.Now()}
	zcodeLoginFlows.Unlock()
	c.JSON(200, gin.H{"session_id": id, "auth_url": u.String(), "expires_in": 300})
}

func (h *Handler) PollZcodeLogin(c *gin.Context) {
	var input struct {
		SessionID string `json:"session_id"`
	}
	if c.ShouldBindJSON(&input) != nil {
		writeError(c, 400, "Invalid request")
		return
	}
	zcodeLoginFlows.Lock()
	flow := zcodeLoginFlows.Flows[input.SessionID]
	zcodeLoginFlows.Unlock()
	if flow == nil || time.Since(flow.Created) > 5*time.Minute {
		c.JSON(200, gin.H{"status": "expired"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	var response struct {
		Data struct {
			Status string `json:"status"`
			Token  string `json:"token"`
		} `json:"data"`
	}
	if err := zcodeJSON(ctx, http.MethodGet, auth.ZcodeBaseURL+"/api/v1/oauth/cli/poll/"+url.PathEscape(flow.FlowID), flow.PollToken, flow.ProxyURL, "", &response); err != nil {
		writeError(c, 502, err.Error())
		return
	}
	status := response.Data.Status
	if status != "ready" && status != "failed" && status != "expired" {
		c.JSON(200, gin.H{"status": "pending"})
		return
	}
	zcodeLoginFlows.Lock()
	current := zcodeLoginFlows.Flows[input.SessionID]
	delete(zcodeLoginFlows.Flows, input.SessionID)
	zcodeLoginFlows.Unlock()
	if current != flow {
		writeError(c, 409, "Sign-in result has already been consumed")
		return
	}
	if status != "ready" {
		c.JSON(200, gin.H{"status": status})
		return
	}
	id, err := h.createZcodeAccount(ctx, response.Data.Token, flow.Name, flow.ProxyURL)
	if err != nil {
		writeError(c, 502, err.Error())
		return
	}
	c.JSON(200, gin.H{"status": "ready", "id": id})
}

func (h *Handler) AddZcodeAccount(c *gin.Context) {
	var input struct {
		Token    string `json:"token"`
		Name     string `json:"name"`
		ProxyURL string `json:"proxy_url"`
	}
	if c.ShouldBindJSON(&input) != nil {
		writeError(c, 400, "Invalid request")
		return
	}
	if err := security.ValidateProxyURL(input.ProxyURL); err != nil {
		writeError(c, 400, "Invalid proxy URL")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	id, err := h.createZcodeAccount(ctx, input.Token, input.Name, input.ProxyURL)
	if err != nil {
		writeError(c, 400, err.Error())
		return
	}
	c.JSON(200, gin.H{"id": id, "message": "Zcode account added"})
}

func (h *Handler) ClaimZcodePlans(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(c, 400, "Invalid account ID")
		return
	}
	var input struct {
		CaptchaParam  string `json:"captcha_param"`
		CaptchaRegion string `json:"captcha_region"`
	}
	if c.ShouldBindJSON(&input) != nil || len(input.CaptchaParam) > 16384 || len(input.CaptchaRegion) > 64 || strings.ContainsAny(input.CaptchaParam+input.CaptchaRegion, "\r\n") {
		writeError(c, 400, "Invalid request")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer cancel()
	row, err := h.db.GetAccountByID(ctx, id)
	if err != nil {
		writeError(c, 404, "Account not found")
		return
	}
	if row.GetCredential("zcode") != "true" || row.GetCredential("upstream_type") != auth.UpstreamZcode {
		writeError(c, 400, "This account is not a Zcode account")
		return
	}
	token := row.GetCredential("access_token")
	if _, err := auth.ZcodeTokenExpiry(token); err != nil {
		writeError(c, 400, err.Error())
		return
	}
	proxyURL := h.resolveClaudeModelProxy(id, row.ProxyURL)
	client := auth.BuildHTTPClient(proxyURL)
	report, err := auth.ClaimZcodeOfferedPlans(ctx, client, auth.ZcodeBaseURL, token, row.GetCredential("zcode_device_id"), input.CaptchaParam, input.CaptchaRegion, func(ctx context.Context) (string, string, error) {
		return zcodecaptcha.Solve(ctx, client, auth.ZcodeBaseURL)
	})
	if err != nil {
		writeError(c, 502, err.Error())
		return
	}
	if quota := report.Quota; quota != nil {
		if err := h.db.UpdateCredentials(ctx, id, map[string]any{"models": quota.Models, "plan_type": quota.Plan, "zcode_quota": string(quota.Balances)}); err != nil {
			report.QuotaError = "Plans processed, but the refreshed billing could not be saved"
		} else {
			if acc := h.store.FindByID(id); acc != nil {
				acc.Mu().Lock()
				acc.Models = append([]string(nil), quota.Models...)
				acc.PlanType = quota.Plan
				acc.Mu().Unlock()
			}
			h.invalidateClaudeCatalogCaches()
			h.expireAccountListSnapshot(database.UpstreamChannelZcode)
		}
	}
	c.JSON(200, report)
}

func (h *Handler) createZcodeAccount(ctx context.Context, token, name, proxyURL string) (int64, error) {
	token = strings.TrimSpace(token)
	expiry, err := auth.ZcodeTokenExpiry(token)
	if err != nil {
		return 0, err
	}
	name = security.SanitizeInput(strings.TrimSpace(name))
	if name == "" {
		name = "Zcode"
	}
	if len(name) > 100 || security.ContainsXSS(name) || security.ContainsSQLInjection(name) {
		return 0, fmt.Errorf("Invalid account name")
	}
	device := auth.ZcodeDeviceID(token)
	egress := proxyURL
	if egress == "" {
		egress = h.store.GetProxyURL()
	}
	quota, err := auth.FetchZcodeQuota(ctx, auth.BuildHTTPClient(egress), auth.ZcodeBaseURL, token, device)
	if err != nil {
		return 0, err
	}
	expiresAt := ""
	if !expiry.IsZero() {
		expiresAt = expiry.UTC().Format(time.RFC3339)
	}
	credentials := map[string]interface{}{"upstream_type": auth.UpstreamZcode, "zcode": "true", "zcode_device_id": device, "access_token": token, "expires_at": expiresAt, "claude_auth_kind": auth.ClaudeAuthKindAPIKey, "claude_base_url": auth.ZcodeBaseURL, "plan_type": quota.Plan, "models": quota.Models, "zcode_quota": string(quota.Balances)}
	h.mergeDuplicateMu.Lock()
	defer h.mergeDuplicateMu.Unlock()
	rows, listErr := h.db.ListActiveByChannel(ctx, database.UpstreamChannelZcode)
	if listErr != nil {
		return 0, fmt.Errorf("Unable to check existing Zcode accounts")
	}
	for _, row := range rows {
		if row.GetCredential("zcode") == "true" && row.GetCredential("access_token") == token {
			return row.ID, nil
		}
	}
	id, err := h.db.InsertAccountWithUpstream(ctx, name, "zcode", auth.UpstreamZcode, credentials, proxyURL)
	if err != nil {
		return 0, fmt.Errorf("Unable to save Zcode account")
	}
	if err := h.store.LoadAccountByID(ctx, id); err != nil {
		return 0, err
	}
	h.db.InsertAccountEventAsync(id, "added", "zcode")
	h.invalidateClaudeCatalogCaches()
	h.expireAccountListSnapshot(database.UpstreamChannelZcode)
	return id, nil
}

func (h *Handler) fetchClaudeRowModels(ctx context.Context, row *database.AccountRow) ([]string, error) {
	proxyURL := h.resolveClaudeModelProxy(row.ID, row.ProxyURL)
	if row.GetCredential("zcode") == "true" {
		quota, err := auth.FetchZcodeQuota(ctx, auth.BuildHTTPClient(proxyURL), auth.ZcodeBaseURL, row.GetCredential("access_token"), row.GetCredential("zcode_device_id"))
		if err != nil {
			return nil, err
		}
		return quota.Models, nil
	}
	return auth.NewClaudeAuth(proxyURL).FetchModelsWithCredentialsAndHeaders(ctx, row.GetCredential("access_token"), row.GetCredential(auth.ClaudeAuthKindCredentialKey), row.GetCredential(auth.ClaudeBaseURLCredentialKey), row.GetCredentialStringMap("custom_headers"), row.GetCredential(auth.ClaudeFingerprintModeCredentialKey))
}
