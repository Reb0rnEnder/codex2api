package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
)

const ZcodeBaseURL = "https://zcode.z.ai"
const UpstreamZcode = "zcode"
const ZcodeVersion = "3.16.3"

func (a *Account) IsZcode() bool {
	if a == nil {
		return false
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.Zcode
}

func ZcodeTokenExpiry(token string) (time.Time, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return time.Time{}, fmt.Errorf("Enter a Zcode account JWT")
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, fmt.Errorf("Invalid Zcode JWT")
	}
	var claims map[string]json.RawMessage
	if json.Unmarshal(b, &claims) != nil || claims == nil {
		return time.Time{}, fmt.Errorf("Invalid Zcode JWT")
	}
	// Zcode can issue tokens without exp. Their validity is checked against
	// the authenticated billing endpoint when adding the account. A zero time
	// means unknown expiry, not a fabricated lifetime or a refresh deadline.
	raw, exists := claims["exp"]
	if !exists || string(raw) == "null" {
		return time.Time{}, nil
	}
	var exp int64
	if json.Unmarshal(raw, &exp) != nil {
		return time.Time{}, fmt.Errorf("Invalid Zcode JWT expiry")
	}
	expiry := time.Unix(exp, 0)
	if !expiry.After(time.Now()) {
		return time.Time{}, fmt.Errorf("Zcode JWT has expired; sign in again")
	}
	return expiry, nil
}

func ZcodeDeviceID(token string) string {
	identity := token
	parts := strings.Split(token, ".")
	if len(parts) == 3 {
		if data, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			var claims struct {
				Sub string `json:"sub"`
			}
			if json.Unmarshal(data, &claims) == nil && claims.Sub != "" {
				identity = claims.Sub
			}
		}
	}
	return uuid.NewSHA1(uuid.NameSpaceDNS, []byte("zcode-gw."+identity)).String()
}

func ZcodeSessionID(deviceID string) string {
	sum := sha256.Sum256([]byte("zcode-session." + deviceID))
	return "session_" + hex.EncodeToString(sum[:16])
}

// Email is display metadata only; the upstream verifies the token itself.
func NormalizeZcodeEmail(value string) string {
	value = strings.TrimSpace(value)
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value || len(value) > 254 {
		return ""
	}
	return value
}

func ZcodeTokenEmail(token string) string {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return ""
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims struct {
		Email string `json:"email"`
		User  struct {
			Email string `json:"email"`
		} `json:"user"`
	}
	if json.Unmarshal(data, &claims) != nil {
		return ""
	}
	if email := NormalizeZcodeEmail(claims.Email); email != "" {
		return email
	}
	return NormalizeZcodeEmail(claims.User.Email)
}

func ZcodeHeaders(token, deviceID string) http.Header {
	h := make(http.Header)
	h.Set("Authorization", "Bearer "+token)
	h.Set("X-Api-Key", token)
	h.Set("Content-Type", "application/json")
	h.Set("Anthropic-Version", "2023-06-01")
	h.Set("Anthropic-Beta", "mid-conversation-system-2026-04-07")
	h.Set("HTTP-Referer", ZcodeBaseURL)
	h.Set("User-Agent", "ZCode/"+ZcodeVersion+" ai-sdk/provider-utils/4.0.27 runtime/node.js/24")
	h.Set("X-Zcode-App-Version", ZcodeVersion)
	h.Set("X-Title", "Z Code@electron")
	h.Set("X-Zcode-Agent", "glm")
	h.Set("X-Platform", "darwin-x64")
	h.Set("X-Release-Channel", "production")
	h.Set("X-Client-Language", "en-US")
	h.Set("X-Client-Timezone", "Europe/Warsaw")
	h.Set("X-Os-Category", "macos")
	h.Set("X-Os-Version", "21.6.0")
	h.Set("X-Device-Mid", deviceID)
	return h
}

type ZcodeQuota struct {
	Models   []string        `json:"models"`
	Plan     string          `json:"plan"`
	Balances json.RawMessage `json:"balances"`
}

func FetchZcodeQuota(ctx context.Context, client *http.Client, baseURL, token, deviceID string) (*ZcodeQuota, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/v1/zcode-plan/billing/balance?app_version=3.17.1", nil)
	if err != nil {
		return nil, err
	}
	req.Header = ZcodeHeaders(token, deviceID)
	req.Header.Set("X-Zcode-App-Version", "3.17.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Zcode quota request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Zcode quota returned HTTP %d", resp.StatusCode)
	}
	var result struct {
		Code *int `json:"code"`
		Data struct {
			Plans []struct {
				Name string `json:"name"`
			} `json:"plans"`
			Balances json.RawMessage `json:"balances"`
		} `json:"data"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&result) != nil || result.Code == nil || *result.Code != 0 {
		return nil, fmt.Errorf("Invalid Zcode billing response")
	}
	var balances []struct {
		ShowName      string `json:"show_name"`
		EntitlementID string `json:"entitlement_id"`
	}
	if json.Unmarshal(result.Data.Balances, &balances) != nil {
		return nil, fmt.Errorf("Zcode did not return model balances")
	}
	q := &ZcodeQuota{Plan: "Zcode", Balances: result.Data.Balances}
	if len(result.Data.Plans) > 0 {
		q.Plan = result.Data.Plans[0].Name
	}
	for _, b := range balances {
		name := strings.TrimSpace(b.ShowName)
		if name == "" {
			name = strings.TrimSpace(b.EntitlementID)
		}
		if strings.HasPrefix(strings.ToLower(name), "glm-") {
			q.Models = append(q.Models, name)
		}
	}
	q.Models = NormalizeOpenAIResponsesModels(q.Models)
	return q, nil
}
