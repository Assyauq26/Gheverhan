//go:build linux

package installer

import (
	"os"
	"path/filepath"
	"testing"
)

func rootBoundaryFixture(t *testing.T) string {
	t.Helper()
	if os.Geteuid() != 0 {
		t.Skip("actual Linux root ownership boundary required")
	}
	// Testing's temp parent can be created under a runner-owned directory;
	// use an explicit root-owned child of the sticky system directory instead.
	dir, err := os.MkdirTemp("/tmp", "p0-root-boundary-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}

func TestP0ProtectedReadRejectsForeignOwnershipAndMutableAncestors(t *testing.T) {
	root := rootBoundaryFixture(t)
	file := filepath.Join(root, "policy.json")
	if err := os.WriteFile(file, []byte("public-fixture-value"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := protectedRead(file, 64, true); err != nil {
		t.Fatal("valid root-private file rejected")
	}
	if err := os.Chown(file, 65534, 65534); err != nil {
		t.Fatal(err)
	}
	if _, err := protectedRead(file, 64, true); err == nil {
		t.Fatal("foreign-owned policy accepted")
	}
	if err := os.Chown(file, 0, 0); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(root, 0777); err != nil {
		t.Fatal(err)
	}
	if _, err := protectedRead(file, 64, true); err == nil {
		t.Fatal("mutable ancestor accepted")
	}
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "policy-link.json")
	if err := os.Symlink(file, link); err != nil {
		t.Fatal(err)
	}
	if _, err := protectedRead(link, 64, true); err == nil {
		t.Fatal("symlink policy accepted")
	}
}

func TestP0StableRootTemplateRejectsForeignFileOwner(t *testing.T) {
	root := rootBoundaryFixture(t)
	file := filepath.Join(root, "compose.yml")
	content := []byte("fixed fixture template\n")
	if err := stableFile(file, content, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(file, 65534, 65534); err != nil {
		t.Fatal(err)
	}
	if err := stableFile(file, content, 0600); err == nil {
		t.Fatal("foreign-owned existing template accepted despite matching bytes")
	}
}
