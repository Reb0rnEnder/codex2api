// Package zcodecaptcha runs the reference Zcode2Api Node verification helper.
// The copied helper retains third_party/Zcode2Api.LICENSE.
package zcodecaptcha

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Release builds install the locked Node dependencies into assets before Go compiles.
//
//go:embed all:assets
var assets embed.FS
var solveGate = make(chan struct{}, 1)
var extractMu sync.Mutex

func Ready(param string) bool {
	b, err := base64.StdEncoding.DecodeString(param)
	if err != nil {
		return false
	}
	var p struct {
		SecurityToken string `json:"securityToken"`
		CertifyID     string `json:"certifyId"`
		IsSign        bool   `json:"isSign"`
	}
	return json.Unmarshal(b, &p) == nil && len(p.SecurityToken) >= 50 && p.CertifyID != "" && p.IsSign
}

func extract() (string, error) {
	extractMu.Lock()
	defer extractMu.Unlock()
	data, _ := assets.ReadFile("assets/solver.js")
	lock, _ := assets.ReadFile("assets/package-lock.json")
	sum := sha256.Sum256(append(data, lock...))
	root, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, "codex2api", "zcode-captcha", hex.EncodeToString(sum[:8]))
	if _, err := os.Stat(filepath.Join(dir, ".ready")); err == nil {
		return dir, nil
	}
	if _, err := assets.ReadFile("assets/node_modules/happy-dom/package.json"); err != nil {
		return "", fmt.Errorf("Zcode CAPTCHA dependencies are missing; build with npm ci --prefix internal/zcodecaptcha/assets first")
	}
	err = fs.WalkDir(assets, "assets", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := strings.TrimPrefix(p, "assets/")
		if p == "assets" {
			rel = ""
		}
		dst := filepath.Join(dir, filepath.FromSlash(rel))
		if d.IsDir() {
			return os.MkdirAll(dst, 0700)
		}
		b, err := assets.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0600)
	})
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, ".ready"), []byte("ready"), 0600); err != nil {
		return "", err
	}
	return dir, nil
}

// Solve fetches the provider's current scene/region and mints a fresh single-use param.
// It never receives account credentials. The helper only talks to public Zcode/CDN endpoints.
func Solve(ctx context.Context, client *http.Client, baseURL string) (string, string, error) {
	select {
	case solveGate <- struct{}{}:
		defer func() { <-solveGate }()
	case <-ctx.Done():
		return "", "", ctx.Err()
	}
	scene, region, prefix := "11xygtvd", "cn", "no8xfe"
	req, _ := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(baseURL, "/")+"/api/v1/client/configs?app_version=3.17.1&platform=darwin-x64", nil)
	if resp, err := client.Do(req); err == nil {
		var config struct {
			Code int `json:"code"`
			Data struct {
				Configs struct {
					Captcha struct {
						Enabled *bool  `json:"enabled"`
						Scene   string `json:"sceneId"`
						Region  string `json:"region"`
						Prefix  string `json:"prefix"`
					} `json:"captcha"`
				} `json:"configs"`
			} `json:"data"`
		}
		err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&config)
		resp.Body.Close()
		if err == nil && resp.StatusCode == 200 && config.Code == 0 {
			c := config.Data.Configs.Captcha
			if c.Enabled != nil && !*c.Enabled {
				return "", "", nil
			}
			if c.Scene != "" {
				scene = c.Scene
			}
			if c.Region != "" {
				region = c.Region
			}
			if c.Prefix != "" {
				prefix = c.Prefix
			}
		}
	}
	dir, err := extract()
	if err != nil {
		return "", "", err
	}
	node := strings.TrimSpace(os.Getenv("ZCODE_NODE_PATH"))
	if node == "" {
		if exe, err := os.Executable(); err == nil {
			name := "node"
			if runtime.GOOS == "windows" {
				name = "node.exe"
			}
			candidate := filepath.Join(filepath.Dir(exe), "runtime", name)
			if _, err := os.Stat(candidate); err == nil {
				node = candidate
			}
		}
	}
	if node == "" {
		node = "node"
	}
	for attempt := 0; attempt < 2; attempt++ {
		// The reference's measured working fallback is cn; the public config
		// can still advertise its expired sgp scene. Keep the minted region
		// with the parameter when falling back.
		if attempt > 0 && region == "sgp" {
			region = "cn"
		}
		cctx, cancel := context.WithTimeout(ctx, 50*time.Second)
		cmd := exec.CommandContext(cctx, node, "solver.js", scene, region, prefix)
		cmd.Dir = dir
		cmd.Env = []string{}
		for _, key := range []string{"PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOME", "LOCALAPPDATA", "APPDATA", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"} {
			if value, ok := os.LookupEnv(key); ok {
				cmd.Env = append(cmd.Env, key+"="+value)
			}
		}
		cmd.Env = append(cmd.Env, "CAPTCHA_CDN_CACHE="+filepath.Join(dir, "cdn-cache"))
		var out bytes.Buffer
		cmd.Stdout = &out
		err = cmd.Run()
		cancel()
		if err == nil {
			for _, line := range strings.Split(out.String(), "\n") {
				if strings.HasPrefix(line, "VERIFY_PARAM=") {
					param := strings.TrimSpace(strings.TrimPrefix(line, "VERIFY_PARAM="))
					if Ready(param) {
						return param, region, nil
					}
				}
			}
		}
		if ctx.Err() != nil {
			return "", "", ctx.Err()
		}
		if _, ok := err.(*exec.Error); ok {
			return "", "", fmt.Errorf("Zcode CAPTCHA needs Node.js 22.19+; install Node or set ZCODE_NODE_PATH")
		}
	}
	return "", "", fmt.Errorf("Zcode CAPTCHA verification failed; retry the claim or supply an official verification result")
}
