package releaseprotocol

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"strings"
	"testing"
	"time"
)

func TestKeylessSignedEnvelopeAndReplayBoundaries(t *testing.T) {
	f := fresh(t)
	p := f.policy
	p.Mode, p.BootstrapRootSHA256, p.MinimumRootThreshold = KeylessMode, "", 0
	p.ExpectedSourceSHA, p.MinimumReleaseSequence = strings.Repeat("a", 40), 1
	m := f.manifest()
	targets := map[string]*metadata.TargetFiles{}
	for name, payload := range f.artifacts {
		tf, e := metadata.TargetFile().FromBytes(name, payload, "sha256")
		if e != nil {
			t.Fatal(e)
		}
		targets[name] = tf
	}
	raw, e := PrepareKeyless(p, m, targets, State{}, f.now)
	if e != nil {
		t.Fatal(e)
	}
	pub, key, _ := ed25519.GenerateKey(rand.Reader)
	b := Bundle{Manifest: raw, KeylessSignature: ed25519.Sign(key, raw)}
	verify := func(raw, sig []byte) error {
		if !ed25519.Verify(pub, raw, sig) {
			return ErrRelease
		}
		return nil
	}
	trusted, state, e := VerifyKeyless(p, b, State{}, f.now, verify)
	if e != nil || trusted.Manifest().ReleaseID != m.ReleaseID || state.TrustMode != KeylessMode || state.SourceSHA != p.ExpectedSourceSHA || state.AuthoritySHA256 != AuthoritySHA256(p) {
		t.Fatal("signed keyless release rejected", e)
	}
	if _, again, e := VerifyKeyless(p, b, state, f.now.Add(time.Second), verify); e != nil || again.ManifestSHA256 != state.ManifestSHA256 {
		t.Fatal("same-byte retry rejected", e)
	}
	if _, _, e := Verify(p, Bundle{}, state, f.now); e == nil {
		t.Fatal("keyless->TUF downgrade accepted")
	}
	for _, item := range []struct {
		name   string
		change func(*Policy, *Bundle, *State)
		at     time.Time
	}{
		{"unsigned", func(_ *Policy, b *Bundle, _ *State) { b.KeylessSignature = nil }, f.now},
		{"tampered", func(_ *Policy, b *Bundle, _ *State) {
			b.Manifest = append(append([]byte(nil), b.Manifest...), byte(' '))
		}, f.now},
		{"nil-verifier", func(_ *Policy, _ *Bundle, _ *State) {}, f.now},
		{"wrong-source", func(p *Policy, _ *Bundle, _ *State) { p.ExpectedSourceSHA = strings.Repeat("b", 40) }, f.now},
		{"wrong-identity", func(p *Policy, _ *Bundle, _ *State) { p.SignerIdentity += "/wrong" }, f.now},
		{"root-injection", func(_ *Policy, b *Bundle, _ *State) { b.BootstrapRoot = []byte("root") }, f.now},
		{"old-mode", func(_ *Policy, _ *Bundle, s *State) {
			s.BootstrapRootSHA256 = strings.Repeat("0", 64)
			s.RootVersion = 1
		}, f.now},
		{"authority-change", func(_ *Policy, _ *Bundle, s *State) { s.AuthoritySHA256 = strings.Repeat("0", 64) }, f.now},
		{"downgrade", func(_ *Policy, _ *Bundle, s *State) { s.HighestReleaseSequence++ }, f.now},
		{"same-sequence-different-manifest", func(_ *Policy, _ *Bundle, s *State) { s.ManifestSHA256 = strings.Repeat("0", 64) }, f.now},
		{"expired", func(_ *Policy, _ *Bundle, _ *State) {}, m.ExpiresAt},
		{"clock-rollback", func(_ *Policy, _ *Bundle, _ *State) {}, f.now.Add(-3 * time.Minute)},
	} {
		t.Run(item.name, func(t *testing.T) {
			policy, payload, previous := p, b, state
			item.change(&policy, &payload, &previous)
			v := verify
			if item.name == "nil-verifier" {
				v = nil
			}
			if _, unchanged, e := VerifyKeyless(policy, payload, previous, item.at, v); e == nil || unchanged != previous {
				t.Fatal("invalid keyless release accepted or state mutated", e)
			}
		})
	}
	var envelope KeylessMetadata
	if json.Unmarshal(raw, &envelope) != nil {
		t.Fatal("fixture")
	}
	for name, pin := range envelope.Artifacts {
		if pin.Length < 1 || pin.SHA256 == "" || trusted.VerifyTarget(name, bytes.NewReader([]byte("tampered"))) == nil {
			t.Fatal("target pin not enforced")
		}
	}
}
