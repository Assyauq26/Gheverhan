package bootstrap

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func pairedRenewalState(t *testing.T, origin string) *State {
	t.Helper()
	state := recoveryState(t)
	if state.Record("PAIR_PENDING") != nil || state.Record("PAIRED") != nil {
		t.Fatal("prepare paired journal")
	}
	old := Credential{
		ControlOrigin: origin, InstallationID: state.Identity.InstallationID,
		DeviceID: "device-fixture", ExpiresAt: time.Now().Add(3*time.Minute).UTC().Format(time.RFC3339),
		Scopes: []string{"report:heartbeat", "release:read"},
		Token: "fixture." + strings.Repeat("a", 64), TokenType: "jetseller-pop",
		Thumbprint: Thumbprint(state.PrivateKey()), ManagementNonce: strings.Repeat("n", 43),
	}
	if state.writePrivate("credential.json", old) != nil {
		t.Fatal("initial credential")
	}
	return state
}

func TestAgentRenewalProofUsesBoundMethodURLTokenAndDeviceKey(t *testing.T) {
	state := recoveryState(t)
	endpoint := "https://portal.example/api/installer/v1/agent/credential/renew"
	proof, err := AgentRenewalProof(state.PrivateKey(), endpoint, "token-fixture", strings.Repeat("n", 43), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(proof, ".")
	if len(parts) != 3 {
		t.Fatal("malformed JWT")
	}
	content := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !ed25519.Verify(state.PrivateKey().Public().(ed25519.PublicKey), []byte(content), signature) {
		t.Fatal("invalid proof signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	var claims map[string]any
	if err != nil || json.Unmarshal(raw, &claims) != nil {
		t.Fatal("invalid proof claims")
	}
	digest := sha256.Sum256([]byte("token-fixture"))
	if claims["htm"] != "POST" || claims["htu"] != endpoint || claims["ath"] != base64.RawURLEncoding.EncodeToString(digest[:]) ||
		claims["nonce"] != strings.Repeat("n", 43) || claims["jti"] == "" {
		t.Fatal("proof not tightly bound to request")
	}
	if _, err := AgentRenewalProof(state.PrivateKey(), endpoint, "token-fixture", "", time.Now()); err == nil {
		t.Fatal("missing server nonce accepted")
	}
}

func TestProactiveRenewalPersistsOnlySameDeviceAndScopes(t *testing.T) {
	var calls int
	var state *State
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "POST" || r.URL.Path != "/api/installer/v1/agent/credential/renew" ||
			r.Header.Get("Content-Type") != "application/json" {
			t.Error("wrong renewal request")
			w.WriteHeader(400)
			return
		}
		oldToken := "fixture." + strings.Repeat("a", 64)
		if r.Header.Get("Authorization") != "DPoP "+oldToken {
			t.Error("no bound authorization")
			w.WriteHeader(401)
			return
		}
		parts := strings.Split(r.Header.Get("DPoP"), ".")
		if len(parts) != 3 {
			t.Error("missing DPoP proof")
			w.WriteHeader(401)
			return
		}
		signed := parts[0] + "." + parts[1]
		sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
		if !ed25519.Verify(state.PrivateKey().Public().(ed25519.PublicKey), []byte(signed), sig) {
			t.Error("bad proof signature")
			w.WriteHeader(401)
			return
		}
		var proof map[string]any
		raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
		if json.Unmarshal(raw, &proof) != nil {
			t.Error("bad proof data")
			w.WriteHeader(400)
			return
		}
		hash := sha256.Sum256([]byte(oldToken))
		if proof["htm"] != "POST" || proof["htu"] != server.URL+r.URL.Path ||
			proof["ath"] != base64.RawURLEncoding.EncodeToString(hash[:]) ||
			proof["nonce"] != strings.Repeat("n", 43) {
			t.Error("wrong claim binding")
			w.WriteHeader(401)
			return
		}
		json.NewEncoder(w).Encode(Credential{
			InstallationID: state.Identity.InstallationID, DeviceID: "device-fixture",
			ExpiresAt: time.Now().Add(9*time.Minute).UTC().Format(time.RFC3339),
			Scopes: []string{"report:heartbeat", "release:read"},
			Token: "refreshed." + strings.Repeat("b", 64), TokenType: "jetseller-pop",
			Thumbprint: Thumbprint(state.PrivateKey()), ManagementNonce: strings.Repeat("n", 43),
		})
	}))
	defer server.Close()
	state = pairedRenewalState(t, server.URL)
	client, err := pairingClient(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	renewed, err := client.Renew(context.Background(), state)
	if err != nil || calls != 1 || renewed.ControlOrigin != server.URL {
		t.Fatal("renew failed", err)
	}
	raw, err := state.readPrivate("credential.json", 16384)
	var saved Credential
	if err != nil || json.Unmarshal(raw, &saved) != nil ||
		saved.Token != renewed.Token || saved.DeviceID != "device-fixture" ||
		saved.Thumbprint != Thumbprint(state.PrivateKey()) {
		t.Fatal("renewal not saved atomically")
	}
}

func TestProactiveRenewalDoesNotPersistExpandedOrForeignCredential(t *testing.T) {
	var state *State
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(Credential{
			InstallationID: state.Identity.InstallationID, DeviceID: "foreign-device",
			ExpiresAt: time.Now().Add(9*time.Minute).UTC().Format(time.RFC3339),
			Scopes: []string{"report:heartbeat", "install:progress", "release:read"},
			Token: "foreign." + strings.Repeat("z", 64), TokenType: "jetseller-pop",
			Thumbprint: Thumbprint(state.PrivateKey()), ManagementNonce: strings.Repeat("n", 43),
		})
	}))
	defer server.Close()
	state = pairedRenewalState(t, server.URL)
	client, _ := pairingClient(server.URL, server.Client())
	if _, err := client.Renew(context.Background(), state); err == nil {
		t.Fatal("foreign device/scope escalation accepted")
	}
	raw, err := state.readPrivate("credential.json", 16384)
	var saved Credential
	if err != nil || json.Unmarshal(raw, &saved) != nil || saved.Token != "fixture."+strings.Repeat("a", 64) {
		t.Fatal("invalid response modified saved credential")
	}
}
