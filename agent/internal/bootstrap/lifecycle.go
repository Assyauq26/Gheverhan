package bootstrap

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"time"
)

var ErrManagement = errors.New("device management unavailable, revoked or invalid; local store data unchanged")

type refreshCheckpoint struct {
	RequestID     string    `json:"request_id"`
	CreatedAt     time.Time `json:"created_at"`
	DeviceID      string    `json:"device_id"`
	ControlOrigin string    `json:"control_origin"`
}
type rotationCheckpoint struct {
	refreshCheckpoint
	OldSeed    string     `json:"old_seed"`
	NewSeed    string     `json:"new_seed"`
	Credential Credential `json:"previous_credential"`
}
type managementInput struct {
	InstallationID string `json:"installation_id"`
	DeviceID       string `json:"device_id"`
	RequestID      string `json:"request_id"`
	NewPublicKey   *JWK   `json:"new_public_key,omitempty"`
}

func decodePrivate(raw []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(value) != nil || d.Decode(new(any)) != io.EOF {
		return ErrState
	}
	return nil
}
func (c *PairingClient) managedCredential(state *State) (Credential, error) {
	var credential Credential
	raw, err := state.readPrivate("credential.json", 16384)
	if err != nil || decodePrivate(raw, &credential) != nil || state.Journal.Phase != "PAIRED" || c.validateCredential(state, credential, false) != nil || credential.ControlOrigin != c.origin || !uuidPattern.MatchString(credential.DeviceID) || !secretPattern.MatchString(credential.ManagementNonce) {
		return credential, ErrManagement
	}
	return credential, nil
}
func managementJWT(key ed25519.PrivateKey, origin, endpoint, operation, nonce string, body []byte, now time.Time) (string, error) {
	if len(key) != ed25519.PrivateKeySize {
		return "", ErrManagement
	}
	id, err := NewUUID()
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(body)
	claims := map[string]any{"aud": origin, "htm": "POST", "htu": origin + "/api/installer/v1" + endpoint, "operation": operation, "request_hash": hex.EncodeToString(digest[:]), "nonce": nonce, "iat": now.Unix(), "exp": now.Add(time.Minute).Unix(), "jti": id}
	raw, err := json.Marshal(claims)
	if err != nil {
		return "", ErrManagement
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"jetseller-management+jwt"}`))
	content := header + "." + base64.RawURLEncoding.EncodeToString(raw)
	return content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(content))), nil
}
func (c *PairingClient) refreshWith(ctx context.Context, state *State, credential Credential, requestID string) (Credential, int, error) {
	var result Credential
	input := managementInput{InstallationID: state.Identity.InstallationID, DeviceID: credential.DeviceID, RequestID: requestID}
	raw, _ := json.Marshal(input)
	proof, err := managementJWT(state.PrivateKey(), c.origin, "/agent/credentials/refresh", "credential-refresh", credential.ManagementNonce, raw, time.Now())
	if err != nil {
		return result, 0, err
	}
	status, err := c.request(ctx, "/agent/credentials/refresh", struct {
		managementInput
		Proof string `json:"proof"`
	}{input, proof}, &result)
	if err != nil {
		return result, status, err
	}
	if status != 200 {
		return result, status, ErrManagement
	}
	if c.validateCredential(state, result, true) != nil || result.DeviceID != credential.DeviceID || result.ManagementNonce != credential.ManagementNonce {
		return Credential{}, 0, ErrManagement
	}
	result.ControlOrigin = c.origin
	return result, status, nil
}

// Refresh uses the existing paired identity after access expiry; it never runs
// host installation preflight, changes Docker or claims PREFLIGHT_OK.
func (c *PairingClient) Refresh(ctx context.Context, state *State) error {
	if _, err := state.root.Lstat("rotation.json"); err == nil {
		return c.Rotate(ctx, state)
	} else if !os.IsNotExist(err) {
		return ErrState
	}
	credential, err := c.managedCredential(state)
	if err != nil {
		return err
	}
	var pending refreshCheckpoint
	raw, err := state.readPrivate("credential-refresh.json", 4096)
	if err == nil {
		if decodePrivate(raw, &pending) != nil || !uuidPattern.MatchString(pending.RequestID) || pending.DeviceID != credential.DeviceID || pending.ControlOrigin != c.origin || pending.CreatedAt.After(time.Now().Add(time.Minute)) {
			return ErrState
		}
		if time.Since(pending.CreatedAt) > 110*time.Second {
			if state.root.Remove("credential-refresh.json") != nil {
				return ErrState
			}
			err = os.ErrNotExist
		}
	}
	if os.IsNotExist(err) {
		id, e := NewUUID()
		if e != nil {
			return e
		}
		pending = refreshCheckpoint{id, time.Now().UTC(), credential.DeviceID, c.origin}
		if state.writePrivate("credential-refresh.json", pending) != nil {
			return ErrState
		}
	} else if err != nil {
		return ErrState
	}
	result, _, err := c.refreshWith(ctx, state, credential, pending.RequestID)
	if err != nil {
		return err
	}
	if state.writePrivate("credential.json", result) != nil {
		return ErrState
	}
	if state.root.Remove("credential-refresh.json") != nil {
		return ErrState
	}
	return nil
}
func keyFromSeed(seed string) (ed25519.PrivateKey, error) {
	raw, err := base64.RawURLEncoding.DecodeString(seed)
	if err != nil || len(raw) != ed25519.SeedSize || base64.RawURLEncoding.EncodeToString(raw) != seed {
		return nil, ErrState
	}
	return ed25519.NewKeyFromSeed(raw), nil
}
func (c *PairingClient) finishRotation(state *State, p rotationCheckpoint, credential Credential) error {
	next := state.Identity
	next.Seed = p.NewSeed
	if state.writePrivate("identity.json", next) != nil {
		return ErrState
	}
	state.Identity = next
	if state.writePrivate("credential.json", credential) != nil {
		return ErrState
	}
	if state.root.Remove("rotation.json") != nil {
		return ErrState
	}
	return nil
}

// Rotate requires old-key and new-key possession. Pending keys are private and
// survive both a lost HTTP response and a crash between identity/credential files.
func (c *PairingClient) Rotate(ctx context.Context, state *State) error {
	var p rotationCheckpoint
	raw, err := state.readPrivate("rotation.json", 32768)
	if os.IsNotExist(err) {
		credential, e := c.managedCredential(state)
		if e != nil {
			return e
		}
		if _, e = state.root.Lstat("credential-refresh.json"); e == nil {
			return ErrManagement
		} else if !os.IsNotExist(e) {
			return ErrState
		}
		seed := make([]byte, ed25519.SeedSize)
		if _, e = rand.Read(seed); e != nil {
			return e
		}
		id, e := NewUUID()
		if e != nil {
			return e
		}
		p = rotationCheckpoint{refreshCheckpoint: refreshCheckpoint{id, time.Now().UTC(), credential.DeviceID, c.origin}, OldSeed: state.Identity.Seed, NewSeed: base64.RawURLEncoding.EncodeToString(seed), Credential: credential}
		if state.writePrivate("rotation.json", p) != nil {
			return ErrState
		}
	} else if err != nil || decodePrivate(raw, &p) != nil {
		return ErrState
	}
	if !uuidPattern.MatchString(p.RequestID) || p.ControlOrigin != c.origin || p.DeviceID != p.Credential.DeviceID || p.Credential.InstallationID != state.Identity.InstallationID || p.CreatedAt.After(time.Now().Add(time.Minute)) || state.Journal.Phase != "PAIRED" {
		return ErrState
	}
	oldKey, err := keyFromSeed(p.OldSeed)
	if err != nil {
		return err
	}
	newKey, err := keyFromSeed(p.NewSeed)
	if err != nil {
		return err
	}
	if state.Identity.Seed != p.OldSeed && state.Identity.Seed != p.NewSeed {
		return ErrState
	}
	newState := &State{Identity: Identity{InstallationID: state.Identity.InstallationID, Seed: p.NewSeed}}
	if time.Since(p.CreatedAt) > 110*time.Second {
		// A lost rotation response past its receipt window can be recovered with
		// possession of the new key. Nonce is a public challenge, stable across rotation.
		id, e := NewUUID()
		if e != nil {
			return e
		}
		candidate := p.Credential
		candidate.Thumbprint = Thumbprint(newKey)
		recovered, status, e := c.refreshWith(ctx, newState, candidate, id)
		if e == nil {
			return c.finishRotation(state, p, recovered)
		}
		if status != http.StatusUnauthorized {
			return e
		}
		id, e = NewUUID()
		if e != nil {
			return e
		}
		p.RequestID = id
		p.CreatedAt = time.Now().UTC()
		if state.writePrivate("rotation.json", p) != nil {
			return ErrState
		}
	}
	pub := publicJWK(newKey)
	input := managementInput{state.Identity.InstallationID, p.DeviceID, p.RequestID, &pub}
	transcript, _ := json.Marshal(input)
	first, err := managementJWT(oldKey, c.origin, "/agent/credentials/rotate", "key-rotation-old", p.Credential.ManagementNonce, transcript, time.Now())
	if err != nil {
		return err
	}
	second, err := managementJWT(newKey, c.origin, "/agent/credentials/rotate", "key-rotation-new", p.Credential.ManagementNonce, transcript, time.Now())
	if err != nil {
		return err
	}
	var result Credential
	status, err := c.request(ctx, "/agent/credentials/rotate", struct {
		managementInput
		Proof    string `json:"proof"`
		NewProof string `json:"new_key_proof"`
	}{input, first, second}, &result)
	if err != nil || status != 200 {
		return ErrManagement
	}
	if c.validateCredential(newState, result, true) != nil || result.DeviceID != p.DeviceID || result.ManagementNonce != p.Credential.ManagementNonce {
		return ErrManagement
	}
	result.ControlOrigin = c.origin
	return c.finishRotation(state, p, result)
}

type Heartbeat struct {
	AgentVersion string  `json:"agent_version"`
	AppVersion   *string `json:"app_version"`
	ImageDigest  *string `json:"app_image_digest"`
	Readiness    string  `json:"readiness"`
	UpdateState  string  `json:"update_state"`
}

func (c *PairingClient) ReportHeartbeat(ctx context.Context, state *State, input Heartbeat) error {
	credential, err := c.managedCredential(state)
	if err != nil {
		return err
	}
	expiry, err := time.Parse(time.RFC3339, credential.ExpiresAt)
	if err != nil {
		return ErrManagement
	}
	if time.Until(expiry) < time.Minute {
		if err = c.Refresh(ctx, state); err != nil {
			return err
		}
		credential, err = c.managedCredential(state)
		if err != nil {
			return err
		}
	}
	raw, err := json.Marshal(input)
	if err != nil {
		return ErrManagement
	}
	digest := sha256.Sum256(raw)
	ath := sha256.Sum256([]byte(credential.Token))
	id, err := NewUUID()
	if err != nil {
		return err
	}
	claims := map[string]any{"htm": "POST", "htu": c.origin + "/api/installer/v1/agent/heartbeat", "ath": base64.RawURLEncoding.EncodeToString(ath[:]), "nonce": credential.ManagementNonce, "iat": time.Now().Unix(), "jti": id, "bht": hex.EncodeToString(digest[:])}
	encoded, _ := json.Marshal(claims)
	content := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"dpop+jwt"}`)) + "." + base64.RawURLEncoding.EncodeToString(encoded)
	proof := content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(state.PrivateKey(), []byte(content)))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.origin+"/api/installer/v1/agent/heartbeat", bytes.NewReader(raw))
	if err != nil {
		return ErrManagement
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "DPoP "+credential.Token)
	req.Header.Set("DPoP", proof)
	response, err := c.client.Do(req)
	if err != nil {
		return ErrManagement
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return ErrManagement
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 4097))
	if err != nil || len(data) > 4096 {
		return ErrManagement
	}
	var result struct {
		InstallationID string `json:"installation_id"`
		DeviceID       string `json:"device_id"`
		Status         string `json:"status"`
		DesiredRelease any    `json:"desired_release"`
	}
	if decodePrivate(data, &result) != nil || result.InstallationID != state.Identity.InstallationID || result.DeviceID != credential.DeviceID || result.Status != "OBSERVATION_ACCEPTED" || result.DesiredRelease != nil {
		return ErrManagement
	}
	return nil
}
