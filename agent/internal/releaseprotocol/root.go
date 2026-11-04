package releaseprotocol

import (
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"time"
)

func validRootRoles(root *metadata.Metadata[metadata.RootType], minimum int) bool {
	for _, role := range []string{"root", "targets", "snapshot", "timestamp"} {
		r := root.Signed.Roles[role]
		if r == nil || r.Threshold < 1 || len(r.KeyIDs) < r.Threshold {
			return false
		}
		if role == "root" && r.Threshold < minimum {
			return false
		}
	}
	return true
}

// VerifyRootChain accepts only sequential old+new-quorum rotations from the
// independent initial pin. Only the final root's expiry is authoritative.
func VerifyRootChain(raw []byte, pin string, minimum int, updates [][]byte, now time.Time) error {
	if minimum < 2 || !hex64.MatchString(pin) || hash(raw) != pin || len(updates) > 64 {
		return ErrRelease
	}
	root, e := metadata.Root().FromBytes(raw)
	if e != nil || !validRootRoles(root, minimum) || root.VerifyDelegate("root", root) != nil {
		return ErrRelease
	}
	for _, raw := range updates {
		next, e := metadata.Root().FromBytes(raw)
		if e != nil || next.Signed.Version != root.Signed.Version+1 || !validRootRoles(next, minimum) || root.VerifyDelegate("root", next) != nil || next.VerifyDelegate("root", next) != nil {
			return ErrRelease
		}
		root = next
	}
	if !root.Signed.Expires.After(now) {
		return ErrRelease
	}
	return nil
}
func VerifyBootstrapRoot(raw []byte, pin string, minimum int, now time.Time) error {
	return VerifyRootChain(raw, pin, minimum, nil, now)
}
