package main

import (
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
