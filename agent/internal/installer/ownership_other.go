//go:build !linux

package installer

import "os"

func ownedByRoot(i os.FileInfo) bool       { return false }
func protectedDirectory(name string) error { return ErrInstall }

func ownedByUID(i os.FileInfo, uid int) bool { return false }
