//go:build linux

package bootstrap

import (
	"os"
)

func ValidateInstallState(s *State) error {
	if os.Geteuid() != 0 || s == nil || s.root == nil || safeAncestors(s.root.Name()) != nil {
		return ErrState
	}
	info, e := os.Lstat(s.root.Name())
	if e != nil || info.Mode().Perm() != 0700 {
		return ErrState
	}
	opened, e := s.root.Lstat(".")
	if e != nil || !os.SameFile(info, opened) {
		return ErrState
	}
	for _, name := range []string{"identity.json", "journal.json", "credential.json", "operation.lock", "install-secrets.json", "install-release-trust.json", "install-journal.json", "local-admin-claim.json"} {
		st, e := s.root.Lstat(name)
		if os.IsNotExist(e) {
			continue
		}
		if e != nil || !st.Mode().IsRegular() || st.Mode().Perm()&0077 != 0 || !ownedBy(st, 0) {
			return ErrState
		}
	}
	return nil
}
