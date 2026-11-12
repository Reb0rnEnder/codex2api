package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/codex2api/auth"
	"github.com/codex2api/security"
	"github.com/gin-gonic/gin"
)

var basisPointsOAuthStore = &oauthSessionStore{sessions: make(map[string]*oauthSession)}

func init() { go basisPointsOAuthStore.cleanupLoop() }

func (h *Handler) StartBasisPointsOAuth(c *gin.Context) {
	var req struct {
		ProxyURL string `json:"proxy_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, 400, "Invalid request")
		return
	}
	if err := security.ValidateProxyURL(req.ProxyURL); err != nil {
		writeError(c, 400, "Invalid proxy URL")
		return
	}
	state, err := oauthRandomHex(32)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	verifier, err := oauthRandomHex(32)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	id, err := oauthRandomHex(16)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	state = "bps." + state + ".PC"
	basisPointsOAuthStore.set(id, &oauthSession{State: state, CodeVerifier: verifier, RedirectURI: auth.BasisPointsRedirectURI, ProxyURL: strings.TrimSpace(req.ProxyURL), CreatedAt: time.Now()})
	c.JSON(http.StatusOK, gin.H{"session_id": id, "auth_url": auth.BasisPointsAuthorizeURL(state, verifier)})
}

func parseBasisPointsCallback(raw, state string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Host != "bps.openai.com" || u.Path != strings.TrimPrefix(auth.BasisPointsRedirectURI, "https://bps.openai.com") {
		return "", fmt.Errorf("Paste the full BasisPoints callback URL")
	}
	q := u.Query()
	if !security.SecureCompare(q.Get("state"), state) {
		return "", fmt.Errorf("OAuth state does not match; restart sign-in")
	}
	if q.Get("error") != "" {
		return "", fmt.Errorf("BasisPoints sign-in was denied; restart sign-in")
	}
	code := strings.TrimSpace(q.Get("code"))
	if code == "" {
		return "", fmt.Errorf("Callback URL has no authorization code")
	}
	return code, nil
}

func (h *Handler) CompleteBasisPointsOAuth(c *gin.Context) {
	var req struct {
		SessionID   string `json:"session_id"`
		CallbackURL string `json:"callback_url"`
		Name        string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, 400, "Invalid request")
		return
	}
	sess, ok := basisPointsOAuthStore.get(req.SessionID)
	if !ok {
		writeError(c, 400, "Sign-in session expired; restart sign-in")
		return
	}
	code, err := parseBasisPointsCallback(req.CallbackURL, sess.State)
	if err != nil {
		writeError(c, 400, err.Error())
		return
	}
	if !sess.claimExchange(code, sess.State) {
		writeError(c, 409, "This sign-in session has already been used; restart sign-in")
		return
	}
	defer basisPointsOAuthStore.delete(req.SessionID)
	proxyURL := sess.ProxyURL
	if proxyURL == "" {
		proxyURL = h.store.GetProxyURL()
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	tokens, err := exchangeBasisPointsCode(ctx, code, sess.CodeVerifier, proxyURL)
	if err != nil {
		writeError(c, 502, err.Error())
		return
	}
	info := accountInfoFromTokens(tokens.IDToken, tokens.AccessToken)
	if info == nil {
		writeError(c, 502, "BasisPoints returned no account identity")
		return
	}
	models, plan, err := auth.FetchBasisPointsModels(ctx, tokens.AccessToken, info.ChatGPTAccountID, proxyURL)
	if err != nil {
		writeError(c, 502, err.Error())
		return
	}
	name := security.SanitizeInput(strings.TrimSpace(req.Name))
	if name == "" {
		name = "BasisPoints"
	}
	if len(name) > 100 || security.ContainsXSS(name) || security.ContainsSQLInjection(name) {
		writeError(c, 400, "Invalid account name")
		return
	}
	credentials := map[string]interface{}{
		"upstream_type": "codex", "basispoints": "true",
		"access_token": tokens.AccessToken, "refresh_token": tokens.RefreshToken, "id_token": tokens.IDToken,
		"expires_at": time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second).UTC().Format(time.RFC3339),
		"account_id": info.ChatGPTAccountID, "email": info.Email, "plan_type": plan,
		"models": models,
	}
	// Keep this identity separate from the same user's Codex OAuth account.
	id, err := h.db.InsertAccountWithCredentials(ctx, name, credentials, sess.ProxyURL)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	if err := h.store.LoadAccountByID(ctx, id); err != nil {
		writeInternalError(c, err)
		return
	}
	h.db.InsertAccountEventAsync(id, "added", "basispoints_oauth")
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "BasisPoints account added", "models": models})
}

func exchangeBasisPointsCode(ctx context.Context, code, verifier, proxyURL string) (*rawOAuthTokenResp, error) {
	form := url.Values{"grant_type": {"authorization_code"}, "client_id": {auth.BasisPointsClientID}, "code": {code}, "code_verifier": {verifier}, "redirect_uri": {auth.BasisPointsRedirectURI}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, auth.BasisPointsTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("X-Basispoints-Auth-Mode", "chatgpt")
	req.Header.Set("Origin", "https://bps.openai.com")
	resp, err := auth.BuildUTLSHTTPClient(proxyURL).Do(req)
	if err != nil {
		return nil, fmt.Errorf("BasisPoints token exchange failed; restart sign-in")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("BasisPoints token exchange returned HTTP %d; restart sign-in", resp.StatusCode)
	}
	var result rawOAuthTokenResp
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return nil, fmt.Errorf("Invalid BasisPoints token response")
	}
	if result.AccessToken == "" || result.RefreshToken == "" || result.ExpiresIn <= 0 {
		return nil, fmt.Errorf("BasisPoints did not return renewable credentials")
	}
	return &result, nil
}
