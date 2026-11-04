//go:build linux

package installer

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestP0DockerStorageUsesTheBudgetedFilesystem(t *testing.T) {
	root := rootBoundaryFixture(t)
	state := filepath.Join(root, "state")
	docker := filepath.Join(root, "docker")
	for _, path := range []string{state, docker} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if sameFilesystem(state, docker) != nil {
		t.Fatal("same protected device rejected")
	}
	if sameFilesystem(state, filepath.Join(root, "absent")) == nil {
		t.Fatal("unknown Docker root accepted")
	}
	link := filepath.Join(root, "docker-link")
	if err := os.Symlink(docker, link); err != nil {
		t.Fatal(err)
	}
	if sameFilesystem(state, link) == nil {
		t.Fatal("symlinked Docker root accepted")
	}
	var a, b syscall.Stat_t
	if syscall.Stat(state, &a) != nil || syscall.Stat("/proc/sys", &b) != nil || a.Dev == b.Dev {
		t.Skip("distinct read-only filesystem unavailable")
	}
	if sameFilesystem(state, "/proc/sys") == nil {
		t.Fatal("Docker storage on an unbudgeted device accepted")
	}
}
