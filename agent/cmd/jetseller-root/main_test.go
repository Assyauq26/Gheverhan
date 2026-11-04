package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFreshOfflineRootQuorumFixture(t *testing.T) {
	out := filepath.Join(t.TempDir(), "FIXTURE-NOT-PRODUCTION")
	pin, e := initRoot(out, time.Now())
	if e != nil {
		t.Fatal(e)
	}
	if len(pin) != 64 {
		t.Fatal("digest required")
	}
	raw, e := os.ReadFile(filepath.Join(out, "1.root.json"))
	if e != nil {
		t.Fatal(e)
	}
	root, e := metadata.Root().FromBytes(raw)
	if e != nil || root.Signed.Roles["root"].Threshold != 2 || len(root.Signed.Roles["root"].KeyIDs) != 3 || root.VerifyDelegate("root", root) != nil {
		t.Fatal("root quorum invalid")
	}
	if _, e = initRoot(out, time.Now()); e == nil {
		t.Fatal("existing ceremony overwritten")
	}
}
func TestCIRootCeremonyRefused(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "true")
	if run() == nil {
		t.Fatal("CI ceremony accepted")
	}
}

func TestOfflineRotationNeedsBothQuorumsAndIndependentPins(t *testing.T) {
	base := t.TempDir()
	oldDir := filepath.Join(base, "OLD-FIXTURE")
	newDir := filepath.Join(base, "NEW-FIXTURE")
	oldPin, e := initRoot(oldDir, time.Now())
	if e != nil {
		t.Fatal(e)
	}
	if _, e = initRoot(newDir, time.Now()); e != nil {
		t.Fatal(e)
	}
	raw, e := os.ReadFile(filepath.Join(newDir, "1.root.json"))
	if e != nil {
		t.Fatal(e)
	}
	next, e := metadata.Root().FromBytes(raw)
	if e != nil {
		t.Fatal(e)
	}
	next.Signed.Version = 2
	raw, e = next.ToBytes(false)
	if e != nil {
		t.Fatal(e)
	}
	candidate := filepath.Join(base, "candidate.json")
	if e = os.WriteFile(candidate, raw, 0600); e != nil {
		t.Fatal(e)
	}
	sum := sha256.Sum256(raw)
	c := map[string]any{"PreviousRoot": filepath.Join(oldDir, "1.root.json"), "CandidateRoot": candidate, "OutputFile": filepath.Join(base, "2.root.json"), "PreviousRootSHA256": oldPin, "CandidateRootSHA256": hex.EncodeToString(sum[:]), "SigningKeys": []string{filepath.Join(oldDir, "root-1.pem"), filepath.Join(oldDir, "root-2.pem")}}
	config := filepath.Join(base, "ceremony.json")
	save := func() {
		b, _ := json.Marshal(c)
		if e = os.WriteFile(config, b, 0600); e != nil {
			t.Fatal(e)
		}
	}
	save()
	if rotate(config) == nil {
		t.Fatal("missing new quorum accepted")
	}
	c["SigningKeys"] = []string{filepath.Join(oldDir, "root-1.pem"), filepath.Join(oldDir, "root-2.pem"), filepath.Join(newDir, "root-1.pem"), filepath.Join(newDir, "root-2.pem")}
	save()
	if e = rotate(config); e != nil {
		t.Fatal(e)
	}
	if e = rotate(config); e == nil {
		t.Fatal("rotation output overwritten")
	}
}
