package auth

import (
	"context"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"strings"
)

// Report the failing stage without exposing proxy credentials or request URLs.
func ZcodeConnectionError(stage string, err error) error {
	reason := "network connection closed before a response"
	var dns *net.DNSError
	var timeout net.Error
	var cert x509.UnknownAuthorityError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		reason = "connection timed out"
	case errors.As(err, &dns):
		reason = "DNS lookup failed"
	case errors.As(err, &cert):
		reason = "TLS certificate was not trusted"
	case errors.As(err, &timeout) && timeout.Timeout():
		reason = "connection timed out"
	case strings.Contains(strings.ToLower(err.Error()), "tls"):
		reason = "TLS handshake failed"
	case strings.Contains(strings.ToLower(err.Error()), "proxy"):
		reason = "proxy connection failed"
	}
	return fmt.Errorf("Zcode %s connection failed: %s", stage, reason)
}
