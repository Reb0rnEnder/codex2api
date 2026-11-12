package admin

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
)

func TestAdminErrorWithoutRequest(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	writeError(c, 409, "Conflict")
	if w.Code != 409 {
		t.Fatalf("status=%d", w.Code)
	}
}

func TestAdminErrorLanguage(t *testing.T) {
	if got := localizeAdminError("en-US,en;q=0.9", "账号不存在"); got != "Account not found" {
		t.Fatal(got)
	}
	for _, language := range []string{"", "zh", "zh-TW"} {
		if got := localizeAdminError(language, "账号不存在"); got != "账号不存在" {
			t.Fatal("existing language changed")
		}
	}
	if got := localizeAdminError("en", "模型名称无效: test-model"); got != "Invalid model name: test-model" {
		t.Fatal(got)
	}
	if got := localizeAdminError("en", "Provider diagnostic 123"); got != "Provider diagnostic 123" {
		t.Fatal("upstream detail was lost")
	}
}
