//go:build !linux

package bootstrap

import "os"

// State locking and ownership are supported only on the initial Ubuntu target.
func ownedBy(_ os.FileInfo, _ int) bool           { return false }
func trustedStateAncestors(_ string, _ int) error { return ErrState }
