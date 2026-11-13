package auth

import (
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestZcodeConnectionErrorsKeepStageAndHideCredentials(t *testing.T) {
	for _, err := range []error{context.DeadlineExceeded, &net.DNSError{Name: "private.example", Err: "lookup failed"}, fmt.Errorf("proxy failed: http://user:secret@example.invalid")} {
		message := ZcodeConnectionError("sign-in", err).Error()
		if !strings.Contains(message, "sign-in") || strings.Contains(message, "secret") || strings.Contains(message, "private.example") {
			t.Fatal("unsafe or missing connection diagnostics")
		}
	}
}
