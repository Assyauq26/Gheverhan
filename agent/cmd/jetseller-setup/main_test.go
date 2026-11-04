package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestProductionCLIRejectsDisposableFixtureEntryPoints(t *testing.T) {
	original := os.Args
	defer func() { os.Args = original }()
	state := filepath.Join(t.TempDir(), "must-not-exist")
	for _, args := range [][]string{
		{"apply-disposable-fixture", "--state", state},
		{"pair", "--fixture-root-sha256", "untrusted", "--state", state},
		{"pair", "--fixture-stack", "/tmp/synthetic/stack", "--state", state},
	} {
		os.Args = append([]string{"jetseller-setup"}, args...)
		if run() == nil {
			t.Fatal("production CLI admitted fixture entry point")
		}
		if _, err := os.Stat(state); !os.IsNotExist(err) {
			t.Fatal("fixture command touched local state")
		}
	}
}

func TestRenewCredentialCommandFailsClosedWithoutPairedDevice(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("local durable state fixture requires Linux")
	}
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()

	statePath := filepath.Join(t.TempDir(), "state")
	const installationID = "550e8400-e29b-41d4-a716-446655440000"
	os.Args = []string{
		"jetseller-setup", "renew-credential",
		"--state", statePath,
		"--installation-id", installationID,
		"--control-origin", "https://control.fixture.example",
	}
	if err := run(); err == nil {
		t.Fatal("unpaired device unexpectedly refreshed credentials")
	}

	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Fatal("unpaired renewal created a new state directory or identity")
	}
	if err := os.Mkdir(statePath, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(statePath, "identity.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := run(); err == nil {
		t.Fatal("incomplete state accepted for renewal")
	}
	if _, err := os.Stat(filepath.Join(statePath, "journal.json")); !os.IsNotExist(err) {
		t.Fatal("renewal created a journal for incomplete state")
	}
}
