package bootstrap

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"time"
)

// RefreshInstallationCredential authenticates with the durable approved device
// key, not an expired bearer or a shared refresh secret. It cannot replace a key,
// change an installation, revive a revoked device, or cross the paired origin.
func (c *PairingClient) RefreshInstallationCredential(ctx context.Context, s *State) (Credential, error) {
	var old Credential
	if c == nil || ValidateInstallState(s) != nil || s.Journal.Phase != "PAIRED" {
		return old, ErrPairing
	}
	b, e := s.readPrivate("credential.json", 16384)
	if e != nil || json.Unmarshal(b, &old) != nil || old.ControlOrigin != c.origin || old.ManagementNonce == "" || c.validateCredential(s, old, false) != nil {
		return Credential{}, ErrPairing
	}
	request := struct {
		InstallationID string `json:"installation_id"`
		DeviceID       string `json:"device_id"`
	}{old.InstallationID, old.DeviceID}
	raw, _ := json.Marshal(request)
	sum := sha256.Sum256(raw)
	id, e := NewUUID()
	if e != nil {
		return Credential{}, ErrPairing
	}
	now := time.Now()
	claims := map[string]any{"aud": c.origin, "iat": now.Unix(), "exp": now.Add(time.Minute).Unix(), "jti": id, "nonce": old.ManagementNonce, "operation": "refresh_installation_credential", "request_hash": hex.EncodeToString(sum[:])}
	body, _ := json.Marshal(claims)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"jetseller-management+jwt"}`))
	content := header + "." + base64.RawURLEncoding.EncodeToString(body)
	proof := content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(s.PrivateKey(), []byte(content)))
	var next Credential
	status, e := c.request(ctx, "/agent/credential/refresh", struct {
		InstallationID string `json:"installation_id"`
		DeviceID       string `json:"device_id"`
		Proof          string `json:"proof"`
	}{old.InstallationID, old.DeviceID, proof}, &next)
	if e != nil || status != 200 || c.validateCredential(s, next, true) != nil || next.DeviceID != old.DeviceID || next.Thumbprint != old.Thumbprint || next.ManagementNonce != old.ManagementNonce {
		return Credential{}, ErrPairing
	}
	next.ControlOrigin = c.origin
	if e = s.writePrivate("credential.json", next); e != nil {
		return Credential{}, e
	}
	return next, nil
}
