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
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

var ErrPairing = errors.New("pairing unavailable, expired or denied")
var codePattern = regexp.MustCompile(`^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$`)
var secretPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{20,512}$`)

type JWK struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
}

func publicJWK(key ed25519.PrivateKey) JWK {
	return JWK{"OKP", "Ed25519", base64.RawURLEncoding.EncodeToString(key.Public().(ed25519.PublicKey))}
}
func Thumbprint(key ed25519.PrivateKey) string {
	x := publicJWK(key).X
	digest := sha256.Sum256([]byte(`{"crv":"Ed25519","kty":"OKP","x":"` + x + `"}`))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

type DeviceSession struct {
	RemoteExpiresAt string    `json:"expires_at,omitempty"`
	SessionID       string    `json:"pairing_session_id"`
	DeviceCode      string    `json:"device_code"`
	UserCode        string    `json:"user_code"`
	Nonce           string    `json:"nonce"`
	ExpiresIn       int       `json:"expires_in"`
	Interval        int       `json:"interval"`
	VerificationURI string    `json:"verification_uri,omitempty"`
	ExpiresAt       time.Time `json:"local_expires_at,omitempty"`
	ControlOrigin   string    `json:"local_control_origin,omitempty"`
}
type Credential struct {
	ManagementNonce string   `json:"management_nonce,omitempty"`
	InstallationID  string   `json:"installation_id"`
	DeviceID        string   `json:"device_id"`
	ExpiresAt       string   `json:"credential_expires_at"`
	Scopes          []string `json:"scopes"`
	Token           string   `json:"credential"`
	TokenType       string   `json:"token_type"`
	Thumbprint      string   `json:"public_key_thumbprint"`
}
type PairingClient struct {
	origin     string
	client     *http.Client
	retryAfter time.Duration
}

func NewPairingClient(origin string) (*PairingClient, error) {
	return pairingClient(origin, &http.Client{Timeout: 8 * time.Second})
}
func pairingClient(origin string, client *http.Client) (*PairingClient, error) {
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, ErrPairing
	}
	copy := *client
	copy.Timeout = 8 * time.Second
	copy.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &PairingClient{origin: origin, client: &copy}, nil
}
func (c *PairingClient) request(ctx context.Context, endpoint string, body any, result any) (int, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return 0, ErrPairing
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.origin+"/api/installer/v1"+endpoint, bytes.NewReader(raw))
	if err != nil {
		return 0, ErrPairing
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	res, err := c.client.Do(req)
	if err != nil {
		return 0, ErrPairing
	}
	defer res.Body.Close()
	c.retryAfter = 0
	if res.StatusCode == 429 {
		seconds, e := strconv.Atoi(res.Header.Get("Retry-After"))
		if e != nil || seconds < 5 {
			seconds = 60
		}
		if seconds > 600 {
			seconds = 600
		}
		c.retryAfter = time.Duration(seconds) * time.Second
	}

	if res.StatusCode != 200 && res.StatusCode != 201 {
		return res.StatusCode, nil
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 32769))
	if err != nil || len(data) > 32768 {
		return 0, ErrPairing
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if decoder.Decode(result) != nil || decoder.Decode(new(any)) != io.EOF {
		return 0, ErrPairing
	}
	return res.StatusCode, nil
}
func (c *PairingClient) RetryAfter() time.Duration { return c.retryAfter }
func (c *PairingClient) Start(ctx context.Context, state *State) (DeviceSession, error) {
	var session DeviceSession
	if state.Journal.Phase != "PREFLIGHT_OK" {
		return session, ErrPairing
	}
	body := struct {
		InstallationID string `json:"installation_hint"`
		PublicKey      JWK    `json:"public_key"`
		Protocol       string `json:"protocol_version"`
		OS             string `json:"os"`
		Arch           string `json:"arch"`
		Version        string `json:"agent_version"`
	}{state.Identity.InstallationID, publicJWK(state.PrivateKey()), "1", "ubuntu-24.04", "amd64", "0.1.0"}
	status, err := c.request(ctx, "/agent/pairing/device", body, &session)
	if err != nil || status != 201 || session.SessionID == "" || !secretPattern.MatchString(session.DeviceCode) || !secretPattern.MatchString(session.Nonce) || !codePattern.MatchString(session.UserCode) || session.ExpiresIn < 1 || session.ExpiresIn > 600 || session.Interval < 5 || session.Interval > 60 {
		return DeviceSession{}, ErrPairing
	}
	if session.VerificationURI == "" {
		session.VerificationURI = c.origin + "/hubungkan-server"
	}
	u, err := url.Parse(session.VerificationURI)
	base, _ := url.Parse(c.origin)
	if err != nil || u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return DeviceSession{}, ErrPairing
	}
	session.ControlOrigin = c.origin
	session.ExpiresAt = time.Now().Add(time.Duration(session.ExpiresIn) * time.Second).UTC()
	if state.writePrivate("pairing.json", session) != nil || state.Record("PAIR_PENDING") != nil {
		return DeviceSession{}, ErrState
	}
	return session, nil
}
func (c *PairingClient) Resume(state *State) (DeviceSession, error) {
	var session DeviceSession
	raw, err := state.readPrivate("pairing.json", 8192)
	if err != nil || json.Unmarshal(raw, &session) != nil || session.ControlOrigin != c.origin || time.Now().After(session.ExpiresAt) || !secretPattern.MatchString(session.DeviceCode) || !secretPattern.MatchString(session.Nonce) || session.Interval < 5 || session.Interval > 60 {
		return session, ErrPairing
	}
	return session, nil
}
func (c *PairingClient) Poll(ctx context.Context, state *State, session DeviceSession) (bool, error) {
	if !time.Now().Before(session.ExpiresAt) {
		return false, ErrPairing
	}
	proof, err := PairingProof(state.PrivateKey(), c.origin, session.DeviceCode, session.Nonce, time.Now())
	if err != nil {
		return false, ErrPairing
	}
	var credential Credential
	status, err := c.request(ctx, "/agent/pairing/token", struct {
		DeviceCode string `json:"device_code"`
		Proof      string `json:"proof"`
	}{session.DeviceCode, proof}, &credential)
	if err != nil {
		return false, err
	}
	if status == 202 || status == 429 {
		return false, nil
	}
	if status != 200 {
		return false, ErrPairing
	}
	expiry, err := time.Parse(time.RFC3339, credential.ExpiresAt)
	if err != nil || !expiry.After(time.Now()) || expiry.After(time.Now().Add(10*time.Minute)) || credential.InstallationID != state.Identity.InstallationID || credential.Thumbprint != Thumbprint(state.PrivateKey()) || credential.TokenType != "jetseller-pop" || credential.DeviceID == "" || len(credential.Token) < 32 || len(credential.Token) > 8192 {
		return false, ErrPairing
	}
	allowed := map[string]bool{"report:heartbeat": true, "install:progress": true, "release:read": true}
	if len(credential.Scopes) == 0 || len(credential.Scopes) > 3 {
		return false, ErrPairing
	}
	for _, scope := range credential.Scopes {
		if !allowed[scope] {
			return false, ErrPairing
		}
		delete(allowed, scope)
	}
	if state.writePrivate("credential.json", credential) != nil || state.Record("PAIRED") != nil {
		return false, ErrState
	}
	if state.root.Remove("pairing.json") != nil {
		return false, ErrState
	}
	return true, nil
}

// This fixed pairing proof profile uses standard Ed25519 JOSE signing. It is
// intentionally not a complete OAuth grant or RFC9449 DPoP implementation.
func PairingProof(key ed25519.PrivateKey, audience, code, nonce string, now time.Time) (string, error) {
	if len(key) != ed25519.PrivateKeySize {
		return "", ErrPairing
	}
	id, err := NewUUID()
	if err != nil {
		return "", ErrPairing
	}
	hash := sha256.Sum256([]byte(code))
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"EdDSA","typ":"jetseller-pairing+jwt"}`))
	claims := map[string]any{"aud": audience, "operation": "pairing-token", "nonce": nonce, "code_hash": hex.EncodeToString(hash[:]), "jti": id, "iat": now.Unix(), "exp": now.Add(60 * time.Second).Unix()}
	raw, err := json.Marshal(claims)
	if err != nil {
		return "", ErrPairing
	}
	content := header + "." + base64.RawURLEncoding.EncodeToString(raw)
	return content + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(content))), nil
}
func NewUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	raw := hex.EncodeToString(b)
	return fmt.Sprintf("%s-%s-%s-%s-%s", raw[:8], raw[8:12], raw[12:16], raw[16:20], raw[20:]), nil
}
