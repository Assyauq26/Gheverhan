package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func recoveryState(t *testing.T) *State {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("durable state recovery requires Linux")
	}
	s, err := OpenState(filepath.Join(t.TempDir(), "state"), "550e8400-e29b-41d4-a716-446655440000")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if s.Record("PREFLIGHT_OK") != nil {
		t.Fatal("preflight")
	}
	return s
}
func fixtureSession(origin string, expires time.Time) DeviceSession {
	return DeviceSession{SessionID: "session-fixture", DeviceCode: strings.Repeat("a", 32), UserCode: "ABCDE-FGHJK", Nonce: strings.Repeat("n", 32), ExpiresIn: 600, Interval: 5, ControlOrigin: origin, ExpiresAt: expires}
}
func TestExpiredPairingRestartsWithoutChangingIdentity(t *testing.T) {
	s := recoveryState(t)
	key := s.Identity.Seed
	calls := 0
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(201)
		json.NewEncoder(w).Encode(fixtureSession("", time.Time{}))
	}))
	defer server.Close()
	client, _ := pairingClient(server.URL, server.Client())
	old := fixtureSession(server.URL, time.Now().Add(-time.Minute))
	if s.writePrivate("pairing.json", old) != nil || s.Record("PAIR_PENDING") != nil {
		t.Fatal("checkpoint")
	}
	session, err := client.Start(context.Background(), s)
	if err != nil || calls != 1 || !session.ExpiresAt.After(time.Now()) || s.Journal.Phase != "PAIR_PENDING" || s.Identity.Seed != key {
		t.Fatal("expired session did not restart safely", err)
	}
	// An expired session cannot authorize changing the persisted control origin.
	expiry := fixtureSession(server.URL, time.Now().Add(-time.Minute))
	if s.writePrivate("pairing.json", expiry) != nil {
		t.Fatal("expiry")
	}
	if _, err = client.Resume(s); !errors.Is(err, errPairingExpired) {
		t.Fatal("expiry checkpoint", err)
	}
	other, _ := NewPairingClient("https://other.fixture.example")
	if _, err = other.Start(context.Background(), s); err == nil || calls != 1 {
		t.Fatal("expired session changed origin")
	}
	// Resume a valid saved replacement from a crash while phase was PAIR_EXPIRED.
	if s.writePrivate("pairing.json", session) != nil {
		t.Fatal("saved replacement")
	}
	if _, err = client.Resume(s); err != nil || s.Journal.Phase != "PAIR_PENDING" {
		t.Fatal("replacement checkpoint", err)
	}
	// Re-running pair while valid resumes the existing code and makes no request.
	if _, err = client.Start(context.Background(), s); err != nil || calls != 1 {
		t.Fatal("valid session replaced", err)
	}
}
func TestSavedSessionRepairsInterruptedJournalBeforePolling(t *testing.T) {
	s := recoveryState(t)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(Credential{InstallationID: s.Identity.InstallationID, DeviceID: "device-fixture", ExpiresAt: time.Now().Add(time.Minute).UTC().Format(time.RFC3339), Scopes: []string{"release:read"}, Token: strings.Repeat("token", 20), TokenType: "jetseller-pop", Thumbprint: Thumbprint(s.PrivateKey())})
	}))
	defer server.Close()
	client, _ := pairingClient(server.URL, server.Client())
	pending := fixtureSession(server.URL, time.Now().Add(time.Minute))
	// Exact crash boundary: private session persisted, journal still PREFLIGHT_OK.
	if s.writePrivate("pairing.json", pending) != nil {
		t.Fatal("session save")
	}
	resumed, err := client.Resume(s)
	if err != nil || s.Journal.Phase != "PAIR_PENDING" {
		t.Fatal("pending checkpoint not repaired", err)
	}
	if paired, err := client.Poll(context.Background(), s, resumed); err != nil || !paired || s.Journal.Phase != "PAIRED" {
		t.Fatal("resumed binding", err)
	}
}
func TestSavedCredentialFinalizesBindingWithoutSecondExchange(t *testing.T) {
	for _, phase := range []string{"PREFLIGHT_OK", "PAIR_PENDING"} {
		t.Run(phase, func(t *testing.T) {
			s := recoveryState(t)
			origin := "https://control.fixture.example"
			client, _ := NewPairingClient(origin)
			pending := fixtureSession(origin, time.Now().Add(-time.Minute))
			if s.writePrivate("pairing.json", pending) != nil {
				t.Fatal("pending")
			}
			if phase == "PAIR_PENDING" && s.Record(phase) != nil {
				t.Fatal("phase")
			}
			credential := Credential{InstallationID: s.Identity.InstallationID, DeviceID: "device-fixture", ExpiresAt: time.Now().Add(-time.Second).UTC().Format(time.RFC3339), Scopes: []string{"release:read"}, Token: strings.Repeat("token", 20), TokenType: "jetseller-pop", Thumbprint: Thumbprint(s.PrivateKey())}
			if s.writePrivate("credential.json", credential) != nil {
				t.Fatal("credential")
			}
			// Old-version credential had no origin field: recover it only from the private pending session.
			// Even expired persisted credentials record a historical binding; no token
			// renewal or current authorization is claimed and no network is requested.
			if _, err := client.Resume(s); !errors.Is(err, ErrAlreadyPaired) || s.Journal.Phase != "PAIRED" {
				t.Fatal("credential checkpoint not finalized", err)
			}
			if _, err := s.root.Lstat("pairing.json"); err == nil {
				t.Fatal("stale code retained")
			}
		})
	}
}

func TestCredentialMetadataClockBoundsDoNotExtendExpiry(t *testing.T) {
	s := recoveryState(t)
	defer s.Close()
	c := &PairingClient{}
	now := time.Now().UTC()
	valid := Credential{InstallationID: s.Identity.InstallationID, Thumbprint: Thumbprint(s.PrivateKey()), TokenType: "jetseller-pop", DeviceID: "fixture-device", Token: strings.Repeat("x", 64), Scopes: []string{"report:heartbeat"}}
	for _, tc := range []struct {
		name   string
		delta  time.Duration
		accept bool
	}{{"normal", 10 * time.Minute, true}, {"bounded_clock_skew", 10*time.Minute + 5*time.Second, true}, {"excess_clock_skew", 10*time.Minute + 5*time.Second + time.Nanosecond, false}, {"expired", -time.Nanosecond, false}} {
		t.Run(tc.name, func(t *testing.T) {
			cred := valid
			cred.ExpiresAt = now.Add(tc.delta).Format(time.RFC3339Nano)
			e := c.validateCredentialAt(s, cred, true, now)
			if (e == nil) != tc.accept {
				t.Fatal("credential metadata time bound mismatch")
			}
		})
	}
}
