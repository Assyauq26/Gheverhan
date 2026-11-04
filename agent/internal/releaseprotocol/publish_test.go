package releaseprotocol

import (
	"crypto/ed25519"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"strings"
	"testing"
	"time"
)

func TestPublicationUsesApprovedRootAndMonotonicState(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	m.ExpiresAt = f.now.Add(time.Hour)
	p := Publication{Policy: f.policy, Root: f.bootstrap, Manifest: m, Version: 1, Keys: f.online, Artifacts: map[string]*metadata.TargetFiles{}}
	for name, b := range f.artifacts {
		tf, e := metadata.TargetFile().FromBytes(name, b, "sha256")
		if e != nil {
			t.Fatal(e)
		}
		p.Artifacts[name] = tf
	}
	_, state, e := Publish(p, f.now)
	if e != nil {
		t.Fatal(e)
	}
	p.Previous = state
	if _, _, e = Publish(p, f.now); e == nil {
		t.Fatal("republication accepted")
	}
	p.Previous = State{}
	p.Keys = map[string]ed25519.PrivateKey{"targets": key(t), "snapshot": f.online["snapshot"], "timestamp": f.online["timestamp"]}
	if _, _, e = Publish(p, f.now); e == nil {
		t.Fatal("unapproved signer accepted")
	}
	p.Keys = f.online
	p.Policy.BootstrapRootSHA256 = strings.Repeat("0", 64)
	if _, _, e = Publish(p, f.now); e == nil {
		t.Fatal("unapproved root accepted")
	}
}

func TestPublicationPreservesSequentialRootRotation(t *testing.T) {
	f := fresh(t)
	nextRoots := []ed25519.PrivateKey{key(t), key(t)}
	online := map[string]ed25519.PrivateKey{"targets": key(t), "snapshot": key(t), "timestamp": key(t)}
	signers := append(append([]ed25519.PrivateKey{}, f.rootKeys...), nextRoots...)
	next := rootBytes(t, f.now, 2, nextRoots, online, signers...)
	m := f.manifest()
	p := Publication{Policy: f.policy, Root: f.bootstrap, RootUpdates: [][]byte{next}, Manifest: m, Version: 1, Keys: online, Artifacts: map[string]*metadata.TargetFiles{}}
	for name, b := range f.artifacts {
		tf, e := metadata.TargetFile().FromBytes(name, b, "sha256")
		if e != nil {
			t.Fatal(e)
		}
		p.Artifacts[name] = tf
	}
	b, state, e := Publish(p, f.now)
	if e != nil || state.RootVersion != 2 || len(b.RootUpdates) != 1 {
		t.Fatal("rotation lost or rejected", e)
	}
	if VerifyRootChain(f.bootstrap, f.policy.BootstrapRootSHA256, 2, p.RootUpdates, f.now) != nil {
		t.Fatal("valid root chain rejected")
	}
	p.RootUpdates = [][]byte{rootBytes(t, f.now, 2, nextRoots, online, nextRoots...)}
	if _, _, e = Publish(p, f.now); e == nil {
		t.Fatal("new root without old quorum accepted")
	}
}
