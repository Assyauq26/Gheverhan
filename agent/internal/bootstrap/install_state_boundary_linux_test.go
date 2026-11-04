//go:build linux

package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

func TestP0InstallStateRejectsForeignOwnedIdentityAndRecords(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("actual Linux root ownership boundary required")
	}
	parent, err := os.MkdirTemp("/tmp", "p0-install-state-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(parent) })
	dir := filepath.Join(parent, "state")
	state, err := OpenState(dir, "550e8400-e29b-41d4-a716-446655440000")
	if err != nil {
		t.Fatal(err)
	}
	defer state.Close()
	if err := ValidateInstallState(state); err != nil {
		t.Fatal("valid root-owned state rejected")
	}
	for _, name := range []string{"identity.json", "journal.json", "operation.lock", "credential.json", "install-secrets.json", "install-release-trust.json", "install-journal.json", "local-admin-claim.json"} {
		t.Run(name, func(t *testing.T) {
			file := filepath.Join(dir, name)
			if _, err := os.Lstat(file); os.IsNotExist(err) {
				if err := os.WriteFile(file, []byte("{}\n"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.Chown(file, 65534, 65534); err != nil {
				t.Fatal(err)
			}
			if err := ValidateInstallState(state); err == nil {
				t.Fatal("foreign-owned privileged state file accepted")
			}
			if err := os.Chown(file, 0, 0); err != nil {
				t.Fatal(err)
			}
		})
	}
}
