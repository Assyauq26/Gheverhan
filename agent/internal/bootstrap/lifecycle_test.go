package bootstrap

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestManagementJOSETranscriptBindsBodyMethodURLAndLifetime(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(2000000000, 0)
	body := []byte(`{"request_id":"550e8400-e29b-41d4-a716-446655440000"}`)
	token, err := managementJWT(key, "https://control.example", "/agent/credentials/refresh", "credential-refresh", "nonce-fixture", body, now)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatal("compact proof required")
	}
	h, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		t.Fatal(e)
	}
	var header map[string]string
	if json.Unmarshal(h, &header) != nil || header["alg"] != "EdDSA" || header["typ"] != "jetseller-management+jwt" {
		t.Fatal("valid restricted JOSE header required")
	}
	raw, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil {
		t.Fatal(e)
	}
	var claims map[string]any
	if json.Unmarshal(raw, &claims) != nil {
		t.Fatal("claims")
	}
	digest := sha256.Sum256(body)
	if claims["request_hash"] != hex.EncodeToString(digest[:]) || claims["htm"] != "POST" || claims["htu"] != "https://control.example/api/installer/v1/agent/credentials/refresh" || claims["aud"] != "https://control.example" || claims["iat"] != float64(now.Unix()) || claims["exp"] != float64(now.Unix()+60) {
		t.Fatal("proof binding or lifetime mismatch")
	}
	sig, e := base64.RawURLEncoding.DecodeString(parts[2])
	if e != nil || !ed25519.Verify(pub, []byte(parts[0]+"."+parts[1]), sig) {
		t.Fatal("Ed25519 proof invalid")
	}
	if ed25519.Verify(pub, []byte(parts[0]+"."+parts[1]+"tampered"), sig) {
		t.Fatal("tampering accepted")
	}
	if _, e := managementJWT(nil, "https://control.example", "/agent/credentials/refresh", "credential-refresh", "nonce", body, now); e == nil {
		t.Fatal("missing key accepted")
	}
}
