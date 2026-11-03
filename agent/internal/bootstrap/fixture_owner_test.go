package bootstrap

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPrivilegedDisposableFixtureRequiresRootOwnedPrivateAncestors(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Linux-only helper")
	}
	root, err := os.MkdirTemp("/tmp", "jetseller-runtime.")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(root)
	stack, state := filepath.Join(root, "stack"), filepath.Join(root, "state")
	for _, dir := range []string{stack, state} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	// A non-root user cannot authorize Docker operations by naming
	// a syntactically valid fixture directory they own.
	if os.Geteuid() != 0 {
		if ValidateDisposableFixturePaths(state, stack) == nil {
			t.Fatal("unprivileged fixture accepted")
		}
		return
	}
	if err := ValidateDisposableFixturePaths(state, stack); err != nil {
		t.Fatal("valid isolated root-owned fixture rejected", err)
	}
	// Unsafe permission on ANY child ancestor must fail closed.
	for _, dir := range []string{root, stack, state} {
		if err := os.Chmod(dir, 0777); err != nil {
			t.Fatal(err)
		}
		if ValidateDisposableFixturePaths(state, stack) == nil {
			t.Fatalf("world-writable directory accepted: %s", dir)
		}
		if err := os.Chmod(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	// Privileged helper must not trust even a mode-0700 directory if
	// it is controlled by an unprivileged account.
	if err := os.Chown(stack, 65534, 65534); err != nil {
		t.Fatal(err)
	}
	if ValidateDisposableFixturePaths(state, stack) == nil {
		t.Fatal("non-root-owned fixture stack accepted")
	}
	if err := os.Chown(stack, 0, 0); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(state, 65534, 65534); err != nil {
		t.Fatal(err)
	}
	if ValidateDisposableFixturePaths(state, stack) == nil {
		t.Fatal("non-root-owned private state accepted")
	}
	if err := os.Chown(state, 0, 0); err != nil {
		t.Fatal(err)
	}
	if err := ValidateDisposableFixturePaths(state, stack); err != nil {
		t.Fatal("restored secure fixture rejected", err)
	}
}
