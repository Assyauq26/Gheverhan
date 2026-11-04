//go:build !linux

package bootstrap

import "os"

// Disposable root provisioning is only supported on Linux.
func rootOwnedDirectory(info os.FileInfo) bool { return false }
