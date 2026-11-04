//go:build linux

package bootstrap

import (
	"os"
	"path/filepath"
	"syscall"
)

func ownedBy(info os.FileInfo, uid int) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && uid >= 0 && stat.Uid == uint32(uid)
}

// Trust only the caller and root along a private state's pathname. A root-owned
// sticky shared directory (e.g. /tmp) is safe for an exclusively created owned
// child; ordinary writable ancestors let another UID replace that child.
func trustedStateAncestors(directory string, uid int) error {
	for current := directory; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || (!ownedBy(info, uid) && !ownedBy(info, 0)) {
			return ErrState
		}
		if info.Mode().Perm()&0022 != 0 && !(ownedBy(info, 0) && info.Mode()&os.ModeSticky != 0) {
			return ErrState
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}
