package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func basisPointsCodeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// BasisPoints uses the Office add-in OAuth client, not the Codex CLI client.
const (
	BasisPointsClientID     = "app_fnr0pYvVwwFDocDumLG3H2Bp"
	BasisPointsTokenURL     = TokenURL + "?unified=true"
	BasisPointsBaseURL      = "https://bps.openai.com/basispoints/api"
	BasisPointsExtensionURL = "https://bps.openai.com/basispoints/extension/360590d7-f8f9-4d88-bf75-0edfe0a4b9f3"
	BasisPointsRedirectURI  = BasisPointsExtensionURL + "/auth/callback"
)

func (a *Account) IsBasisPoints() bool {
	if a == nil {
		return false
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.BasisPoints
}

func BasisPointsClientHeaders() http.Header {
	h := make(http.Header)
	h.Set("X-Basispoints-Auth-Mode", "chatgpt")
	h.Set("X-Openai-Internal-Basispoints-Client-Product", "basispoints-powerpoint-plugin")
	h.Set("X-Openai-Internal-Basispoints-Client-Platform", "powerpoint")
	h.Set("X-Openai-Internal-Basispoints-Client-Agent-Profile", "powerpoint")
	h.Set("X-Openai-Internal-Basispoints-Client-Editor", "powerpoint")
	h.Set("X-Openai-Internal-Basispoints-Client-Host", "office")
	h.Set("X-Openai-Internal-Basispoints-Client-Runtime", "desktop")
	h.Set("X-Openai-Internal-Basispoints-Client-Platform-Class", "PC")
	h.Set("X-Openai-Internal-Basispoints-Office-Host", "PowerPoint")
	h.Set("X-Openai-Internal-Basispoints-Office-Platform", "PC")
	return h
}

func BasisPointsAuthorizeURL(state, verifier string) string {
	q := url.Values{
		"state": {state}, "platform": {"PC"}, "code_challenge": {basisPointsCodeChallenge(verifier)},
	}
	return BasisPointsExtensionURL + "/auth/start?" + q.Encode()
}

// Access is checked against BasisPoints itself; Codex/WHAM entitlements are unrelated.
func FetchBasisPointsModels(ctx context.Context, accessToken, accountID, proxyURL string) ([]string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, BasisPointsBaseURL+"/responses/access?include_models=true", nil)
	if err != nil {
		return nil, "", err
	}
	req.Header = BasisPointsClientHeaders()
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if accountID != "" {
		req.Header.Set("Chatgpt-Account-Id", accountID)
		req.Header.Set("X-Openai-Account-Id", accountID)
	}
	resp, err := BuildUTLSHTTPClient(proxyURL).Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("BasisPoints access check failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("BasisPoints access check returned HTTP %d", resp.StatusCode)
	}
	var result struct {
		Allowed      bool   `json:"allowed"`
		PlanType     string `json:"plan_type"`
		ModelCatalog *struct {
			Models []struct {
				ID string `json:"id"`
			} `json:"models"`
		} `json:"model_catalog"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return nil, "", fmt.Errorf("invalid BasisPoints access response")
	}
	if !result.Allowed {
		return nil, "", fmt.Errorf("this account does not have BasisPoints access")
	}
	var models []string
	if result.ModelCatalog != nil {
		for _, model := range result.ModelCatalog.Models {
			if strings.TrimSpace(model.ID) != "" {
				models = append(models, model.ID)
			}
		}
	}
	models = NormalizeOpenAIResponsesModels(models)
	if len(models) == 0 {
		return nil, "", fmt.Errorf("BasisPoints did not return a model catalog; sign in again")
	}
	return models, result.PlanType, nil
}
