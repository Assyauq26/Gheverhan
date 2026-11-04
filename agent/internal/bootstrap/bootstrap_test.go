package bootstrap

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestPreflightRejectsUnsafeHosts(t *testing.T) {
	valid := HostFacts{"linux", "amd64", "ubuntu:24.04", 2, 4 << 30, 40 << 30, 10000, true, false}
	if ValidateHost(valid) != nil {
		t.Fatal("valid proposal rejected")
	}
	bad := []HostFacts{valid, valid, valid, valid, valid, valid, valid, valid}
	bad[0].OS = "windows"
	bad[1].Arch = "arm64"
	bad[2].Release = "ubuntu:20.04"
	bad[3].CPUs = 1
	bad[4].MemoryBytes = 1
	bad[5].FreeBytes = 1
	bad[6].PortsAvailable = false
	bad[7].ExistingServices = true
	for _, f := range bad {
		if ValidateHost(f) == nil {
			t.Fatal("unsafe host accepted")
		}
	}
}
func TestOSAndMemoryParsing(t *testing.T) {
	if got, e := ParseOSRelease(strings.NewReader("ID=ubuntu\nVERSION_ID=\"24.04\"\n")); e != nil || got != "ubuntu:24.04" {
		t.Fatal("release")
	}
	for _, s := range []string{"ID=debian\nVERSION_ID=24.04", "ID=ubuntu\nID=ubuntu\nVERSION_ID=24.04", "ID=ubuntu\nVERSION_ID=20.04", "ID=ubuntu\nVERSION_ID=26.04"} {
		if _, e := ParseOSRelease(strings.NewReader(s)); e == nil {
			t.Fatal("bad OS accepted")
		}
	}
	if got, e := MemoryBytes(strings.NewReader("MemTotal: 4194304 kB\n")); e != nil || got != 4<<30 {
		t.Fatal("memory")
	}
	if _, e := MemoryBytes(strings.NewReader("MemTotal: -1 kB")); e == nil {
		t.Fatal("bad memory")
	}
}
func TestPairingProofBindsKeyNonceCodeAndAudience(t *testing.T) {
	public, key, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Now()
	proof, e := PairingProof(key, "https://control.fixture.example", "secret-device-code", "server-nonce", now)
	if e != nil {
		t.Fatal(e)
	}
	parts := strings.Split(proof, ".")
	signature, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if !ed25519.Verify(public, []byte(parts[0]+"."+parts[1]), signature) {
		t.Fatal("invalid signature")
	}
	raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var claims map[string]any
	json.Unmarshal(raw, &claims)
	hash := sha256.Sum256([]byte("secret-device-code"))
	if claims["aud"] != "https://control.fixture.example" || claims["nonce"] != "server-nonce" || claims["code_hash"] != hex.EncodeToString(hash[:]) || claims["operation"] != "pairing-token" || claims["exp"].(float64)-claims["iat"].(float64) != 60 {
		t.Fatal("binding mismatch")
	}
	second, _ := PairingProof(key, "https://control.fixture.example", "secret-device-code", "server-nonce", now)
	if second == proof {
		t.Fatal("proof replay ID reused")
	}
	if _, e = PairingProof(nil, "", "", "", now); e == nil {
		t.Fatal("invalid key")
	}
}
func TestPairingRequiresHTTPSAndForbidsRedirects(t *testing.T) {
	for _, origin := range []string{"http://control.example", "https://user:secret@control.example", "https://control.example/path", "https://control.example?token=secret"} {
		if _, e := NewPairingClient(origin); e == nil {
			t.Fatal("unsafe origin")
		}
	}
	var received bool
	other := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { received = true }))
	defer other.Close()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	client, _ := pairingClient(server.URL, server.Client())
	status, e := client.request(context.Background(), "/agent/pairing/device", map[string]string{"device_code": "must-not-forward"}, new(any))
	if e != nil || status != 307 || received {
		t.Fatal("redirect followed")
	}
}
func TestVerificationFailsClosedWithoutTrustOrWithTampering(t *testing.T) {
	dir := t.TempDir()
	artifact := filepath.Join(dir, "artifact")
	os.WriteFile(artifact, []byte("approved"), 0600)
	bundle := filepath.Join(dir, "bundle")
	os.WriteFile(bundle, []byte("{}"), 0600)
	policy := VerifyPolicy{VerifierPath: filepath.Join(dir, "missing"), VerifierSHA256: strings.Repeat("a", 64), CertificateIdentity: "exact", OIDCIssuer: "https://issuer.example"}
	if VerifyArtifact(context.Background(), VerifyPolicy{}, artifact, bundle, strings.Repeat("a", 64)) == nil {
		t.Fatal("missing trust")
	}
	if VerifyArtifact(context.Background(), policy, artifact, bundle, strings.Repeat("a", 64)) == nil {
		t.Fatal("missing verifier")
	}
	target := filepath.Join(dir, "copy")
	hash := sha256.Sum256([]byte("approved"))
	os.WriteFile(artifact, []byte("tampered"), 0600)
	if copyVerified(artifact, target, hex.EncodeToString(hash[:]), 4096, 0600) == nil {
		t.Fatal("tampered hash accepted")
	}
}
func TestRateLimitBackoffAndBoundedJSON(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Retry-After", "120"); w.WriteHeader(429) }))
	defer server.Close()
	client, _ := pairingClient(server.URL, server.Client())
	status, e := client.request(context.Background(), "/agent/pairing/token", map[string]string{}, new(any))
	if e != nil || status != 429 || client.RetryAfter() != 120*time.Second {
		t.Fatal("server backoff not honored")
	}
	huge := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(strings.Repeat("x", 32769))) }))
	defer huge.Close()
	client, _ = pairingClient(huge.URL, huge.Client())
	if _, e = client.request(context.Background(), "/agent/pairing/token", map[string]string{}, new(any)); e == nil {
		t.Fatal("oversized response accepted")
	}
}
func TestStateLockIdentityAndResume(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("flock and durable directory fsync require Linux")
	}
	parent := t.TempDir()
	dir := filepath.Join(parent, "state")
	id := "550e8400-e29b-41d4-a716-446655440000"
	state, e := OpenState(dir, id)
	if e != nil {
		t.Fatal(e)
	}
	key := state.Identity.Seed
	if _, e = OpenState(dir, id); e == nil {
		t.Fatal("concurrent operation accepted")
	}
	if state.Record("PAIRED") == nil {
		t.Fatal("invalid transition")
	}
	if state.Record("PREFLIGHT_OK") != nil {
		t.Fatal("preflight checkpoint")
	}
	state.Close()
	resumed, e := OpenState(dir, id)
	if e != nil {
		t.Fatal(e)
	}
	if resumed.Identity.Seed != key || resumed.Journal.Phase != "PREFLIGHT_OK" {
		t.Fatal("identity lost")
	}
	resumed.Close()
	if _, e = OpenState(dir, "a32cc632-e749-4be8-9a4d-27c50d6bb780"); e == nil {
		t.Fatal("identity overwritten")
	}
	raw, _ := os.ReadFile(filepath.Join(dir, "journal.json"))
	if strings.Contains(string(raw), key) {
		t.Fatal("key leaked to journal")
	}
	os.Remove(filepath.Join(dir, "identity.json"))
	if _, e = OpenState(dir, id); e == nil {
		t.Fatal("lost key silently regenerated")
	}
	os.Chmod(dir, 0755)
	if _, e = OpenState(dir, id); e == nil {
		t.Fatal("public state accepted")
	}
}
func TestPairingTLSFixtureAndKeyBinding(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("durable state Linux fixture")
	}
	state, e := OpenState(filepath.Join(t.TempDir(), "state"), "550e8400-e29b-41d4-a716-446655440000")
	if e != nil {
		t.Fatal(e)
	}
	defer state.Close()
	state.Record("PREFLIGHT_OK")
	polls := 0
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Error("unsafe method")
		}
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/device") {
			w.WriteHeader(201)
			json.NewEncoder(w).Encode(map[string]any{"pairing_session_id": "session-fixture", "device_code": strings.Repeat("a", 32), "user_code": "ABCDE-FGHJK", "nonce": strings.Repeat("n", 32), "expires_in": 600, "interval": 5})
			return
		}
		polls++
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), "proof") {
			t.Error("missing proof")
		}
		if polls == 1 {
			w.WriteHeader(202)
			return
		}
		json.NewEncoder(w).Encode(Credential{InstallationID: state.Identity.InstallationID, DeviceID: "device-fixture", ExpiresAt: time.Now().Add(time.Minute).UTC().Format(time.RFC3339), Scopes: []string{"report:heartbeat", "install:progress", "release:read"}, Token: strings.Repeat("token", 20), TokenType: "jetseller-pop", Thumbprint: Thumbprint(state.PrivateKey())})
	}))
	defer server.Close()
	client, _ := pairingClient(server.URL, server.Client())
	session, e := client.Start(context.Background(), state)
	if e != nil {
		t.Fatal(e)
	}
	if state.Journal.Phase != "PAIR_PENDING" {
		t.Fatal("journal")
	}
	other, _ := pairingClient("https://other.example", server.Client())
	if _, e = other.Resume(state); e == nil {
		t.Fatal("device code could leak across origins")
	}
	session, e = client.Resume(state)
	if e != nil {
		t.Fatal(e)
	}
	if paired, e := client.Poll(context.Background(), state, session); e != nil || paired {
		t.Fatal("pending handling")
	}
	if paired, e := client.Poll(context.Background(), state, session); e != nil || !paired {
		t.Fatal("binding")
	}
	if state.Journal.Phase != "PAIRED" {
		t.Fatal("paired phase")
	}
	raw, _ := os.ReadFile(filepath.Join(state.root.Name(), "journal.json"))
	if strings.Contains(string(raw), "token") || strings.Contains(string(raw), session.DeviceCode) {
		t.Fatal("secret journal")
	}
}
