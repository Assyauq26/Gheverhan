package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
)

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

	state, err := bootstrap.OpenState(statePath, installationID)
	if err != nil {
		t.Fatal("failed to inspect local state after rejection", err)
	}
	defer state.Close()
	if state.Journal.Phase != "INITIALIZED" {
		t.Fatalf("renew command unexpectedly advanced provisioning state: %s", state.Journal.Phase)
	}
	if _, err = os.Stat(filepath.Join(statePath, "credential.json")); !os.IsNotExist(err) {
		t.Fatal("failed renewal wrote a credential")
	}
}
