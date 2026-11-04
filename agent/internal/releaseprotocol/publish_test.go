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
