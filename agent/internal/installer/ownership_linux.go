//go:build linux

package installer

import (
	"os"
	"path/filepath"
	"syscall"
)

func ownedByRoot(i os.FileInfo) bool { s, ok := i.Sys().(*syscall.Stat_t); return ok && s.Uid == 0 }
func protectedDirectory(name string) error {
	if !filepath.IsAbs(name) || filepath.Clean(name) != name {
		return ErrInstall
	}
	for p := name; ; p = filepath.Dir(p) {
		i, e := os.Lstat(p)
		if e != nil || !i.IsDir() || i.Mode()&os.ModeSymlink != 0 || !ownedByRoot(i) {
			return ErrInstall
		}
		if i.Mode().Perm()&0022 != 0 && !(p == "/tmp" && i.Mode()&os.ModeSticky != 0) {
			return ErrInstall
		}
		if p == filepath.Dir(p) {
			break
		}
	}
	return nil
}

func ownedByUID(i os.FileInfo, uid int) bool {
	s, ok := i.Sys().(*syscall.Stat_t)
	return ok && uid >= 0 && s.Uid == uint32(uid)
}
