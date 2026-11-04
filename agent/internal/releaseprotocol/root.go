package releaseprotocol

import (
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"time"
)

// VerifyBootstrapRoot validates only independently pinned public root bytes.
func VerifyBootstrapRoot(raw []byte, pin string, minimum int, now time.Time) error {
	if minimum < 2 || !hex64.MatchString(pin) || hash(raw) != pin {
		return ErrRelease
	}
	root, e := metadata.Root().FromBytes(raw)
	if e != nil || !root.Signed.Expires.After(now) {
		return ErrRelease
	}
	for _, role := range []string{"root", "targets", "snapshot", "timestamp"} {
		r := root.Signed.Roles[role]
		if r == nil || r.Threshold < 1 || len(r.KeyIDs) < r.Threshold {
			return ErrRelease
		}
		if role == "root" && r.Threshold < minimum {
			return ErrRelease
		}
	}
	if root.VerifyDelegate("root", root) != nil {
		return ErrRelease
	}
	return nil
}
