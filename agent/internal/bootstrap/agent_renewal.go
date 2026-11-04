package bootstrap

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// AgentRenewalProof binds a live credential to the exact renewal POST,
// including the access token hash and a fresh proof jti. This follows the
// portal's currently reviewed, restricted DPoP-like verification profile.
func AgentRenewalProof(key ed25519.PrivateKey, endpoint, token, nonce string, now time.Time) (string, error) {
	if len(key) != ed25519.PrivateKeySize || token == "" || !secretPattern.MatchString(nonce) {
		return "", ErrPairing
	}
	id, err := NewUUID()
	if err != nil {
		return "", ErrPairing
	}
	digest := sha256.Sum256([]byte(token))
	claims := map[string]any{
		"htm": http.MethodPost, "htu": endpoint,
		"ath": base64.RawURLEncoding.EncodeToString(digest[:]),
		"nonce": nonce, "jti": id,
		"iat": now.Unix(), "exp": now.Add(60 * time.Second).Unix(),
	}
	raw, err := json.Marshal(claims)
	if err != nil {
		return "", ErrPairing
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"dpop+jwt"}`))
	content := header + "." + base64.RawURLEncoding.EncodeToString(raw)
	return content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(content))), nil
}

// Renew exchanges an unexpired credential for a newly signed credential.
// It refuses revoked/wrong-device tokens at the server, preserves local
// installation identity and scopes, and saves the response atomically.
// This is NOT an expired-token recovery/rotation protocol.
func (c *PairingClient) Renew(ctx context.Context, state *State) (Credential, error) {
	var empty Credential
	if c == nil || state == nil || state.root == nil || state.Journal.Phase != "PAIRED" {
		return empty, ErrPairing
	}
	raw, err := state.readPrivate("credential.json", 16384)
	var previous Credential
	if err != nil || json.Unmarshal(raw, &previous) != nil ||
		previous.ControlOrigin != c.origin || previous.ManagementNonce == "" ||
		c.validateCredential(state, previous, true) != nil {
		return empty, ErrPairing
	}
	endpoint := c.origin + "/api/installer/v1/agent/credential/renew"
	proof, err := AgentRenewalProof(state.PrivateKey(), endpoint, previous.Token, previous.ManagementNonce, time.Now())
	if err != nil {
		return empty, ErrPairing
	}
	var next Credential
	status, err := c.agentRequest(ctx, "/agent/credential/renew", struct{}{}, &next, previous.Token, proof)
	if err != nil || status != 200 || next.Token == previous.Token ||
		c.validateCredential(state, next, true) != nil ||
		next.InstallationID != previous.InstallationID || next.DeviceID != previous.DeviceID ||
		next.Thumbprint != previous.Thumbprint || next.ManagementNonce != previous.ManagementNonce ||
		len(next.Scopes) != len(previous.Scopes) {
		return empty, ErrPairing
	}
	for i := range next.Scopes {
		if next.Scopes[i] != previous.Scopes[i] {
			return empty, ErrPairing
		}
	}
	// Reject a stale/misconfigured control plane that reissues an almost
	// expired token. The normal service issues ten-minute tokens.
	expiry, err := time.Parse(time.RFC3339, next.ExpiresAt)
	if err != nil || !expiry.After(time.Now().Add(time.Minute)) {
		return empty, ErrPairing
	}
	next.ControlOrigin = c.origin
	if err := state.writePrivate("credential.json", next); err != nil {
		return empty, errors.Join(ErrState, err)
	}
	return next, nil
}
