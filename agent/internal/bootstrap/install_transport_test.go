package bootstrap

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScopedDownloadAuthorizationTransport(t *testing.T) {
	pub, key, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	calls := 0
	var server *httptest.Server
	credential := Credential{Token: "synthetic-opaque-token-not-production", ManagementNonce: "synthetic-bound-nonce"}
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.TLS == nil || r.Header.Get("Authorization") != "DPoP "+credential.Token {
			t.Error("authenticated TLS transport missing")
		}
		parts := strings.Split(r.Header.Get("DPoP"), ".")
		if len(parts) != 3 {
			t.Error("missing JOSE proof")
			w.WriteHeader(401)
			return
		}
		sig, e := base64.RawURLEncoding.DecodeString(parts[2])
		if e != nil || !ed25519.Verify(pub, []byte(parts[0]+"."+parts[1]), sig) {
			t.Error("invalid device signature")
			w.WriteHeader(401)
			return
		}
		headerBytes, _ := base64.RawURLEncoding.DecodeString(parts[0])
		var header map[string]any
		if json.Unmarshal(headerBytes, &header) != nil || header["alg"] != "EdDSA" || header["typ"] != "dpop+jwt" {
			t.Error("JOSE proof profile changed")
		}
		raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
		var claims map[string]any
		if json.Unmarshal(raw, &claims) != nil {
			t.Fatal("malformed claims")
		}
		ath := sha256.Sum256([]byte(credential.Token))
		body, _ := io.ReadAll(r.Body)
		bh := sha256.Sum256(body)
		if claims["htu"] != server.URL+r.URL.RequestURI() || claims["htm"] != r.Method || claims["ath"] != base64.RawURLEncoding.EncodeToString(ath[:]) || claims["nonce"] != credential.ManagementNonce || claims["body_sha256"] != base64.RawURLEncoding.EncodeToString(bh[:]) {
			t.Error("proof method/URL/token/nonce/body binding changed")
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"accepted":true}`)
	}))
	defer server.Close()
	client, e := pairingClient(server.URL, server.Client())
	if e != nil {
		t.Fatal(e)
	}
	credential.ControlOrigin = server.URL
	for _, tc := range []struct {
		method, route string
		body          any
	}{{"GET", "/agent/release-download-authorization", nil}, {"GET", "/agent/install-authorization", nil}, {"POST", "/agent/install-progress", map[string]any{"sequence": 1}}} {
		var out struct {
			Accepted bool `json:"accepted"`
		}
		if e = client.installRequestWithCredential(context.Background(), key, credential, tc.method, tc.route, tc.body, &out); e != nil || !out.Accepted {
			t.Fatalf("required protocol endpoint rejected before HTTP: %s %s calls=%d", tc.method, tc.route, calls)
		}
	}
	if calls != 3 {
		t.Fatal("required endpoint never reached authenticated server")
	}
	for _, tc := range []struct{ method, route string }{{"POST", "/agent/release-download-authorization"}, {"GET", "/agent/install-progress"}, {"GET", "/agent/release-download-authorization?other=1"}, {"GET", "/agent/arbitrary"}} {
		if client.installRequestWithCredential(context.Background(), key, credential, tc.method, tc.route, nil, nil) == nil {
			t.Fatal("unauthorized operation admitted")
		}
	}
	if calls != 3 {
		t.Fatal("denied operation escaped to network")
	}
}
