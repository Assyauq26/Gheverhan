package bootstrap

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

func installProof(key ed25519.PrivateKey, method, endpoint, token, nonce string, body []byte) (string, error) {
	id, e := NewUUID()
	if e != nil {
		return "", ErrPairing
	}
	now := time.Now()
	ath := sha256.Sum256([]byte(token))
	bh := sha256.Sum256(body)
	claims := map[string]any{"htm": method, "htu": endpoint, "ath": base64.RawURLEncoding.EncodeToString(ath[:]), "nonce": nonce, "jti": id, "iat": now.Unix(), "exp": now.Add(time.Minute).Unix(), "body_sha256": base64.RawURLEncoding.EncodeToString(bh[:])}
	b, e := json.Marshal(claims)
	if e != nil {
		return "", ErrPairing
	}
	head := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"dpop+jwt"}`))
	content := head + "." + base64.RawURLEncoding.EncodeToString(b)
	return content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(content))), nil
}

// InstallRequest never follows an origin-changing redirect or prints response
// bodies/tokens. The local paired origin, key and UUID must remain unchanged.
func (c *PairingClient) InstallRequest(ctx context.Context, s *State, method, route string, body any, out any) error {
	if c == nil || s == nil || !((method == "GET" && route == "/agent/install-authorization") || (method == "POST" && route == "/agent/install-progress")) {
		return ErrPairing
	}
	credential, e := s.PairedCredential()
	if e != nil {
		credential, e = c.RefreshInstallationCredential(ctx, s)
	}
	if e == nil {
		expiry, _ := time.Parse(time.RFC3339, credential.ExpiresAt)
		if expiry.Before(time.Now().Add(2 * time.Minute)) {
			credential, e = c.RefreshInstallationCredential(ctx, s)
		}
	}
	if e != nil || credential.ControlOrigin != c.origin {
		return ErrPairing
	}
	var raw []byte
	if method == "POST" {
		raw, e = json.Marshal(body)
		if e != nil || len(raw) > 4096 {
			return ErrPairing
		}
	}
	endpoint := c.origin + "/api/installer/v1" + route
	proof, e := installProof(s.PrivateKey(), method, endpoint, credential.Token, credential.ManagementNonce, raw)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(raw))
	if e != nil {
		return ErrPairing
	}
	req.Header.Set("Authorization", "DPoP "+credential.Token)
	req.Header.Set("DPoP", proof)
	req.Header.Set("Accept", "application/json")
	if method == "POST" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, e := c.client.Do(req)
	if e != nil {
		return ErrPairing
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return ErrPairing
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, 32769))
	if e != nil || len(b) > 32768 {
		return ErrPairing
	}
	if out != nil && json.Unmarshal(b, out) != nil {
		return ErrPairing
	}
	return nil
}
