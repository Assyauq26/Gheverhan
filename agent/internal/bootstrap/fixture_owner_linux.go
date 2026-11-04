//go:build linux

package bootstrap

import (
  "os"
  "syscall"
)

// The privileged fixture helper must not trust a caller-owned directory.
func rootOwnedDirectory(info os.FileInfo) bool {
  stat, ok := info.Sys().(*syscall.Stat_t)
  return ok && stat.Uid == 0
}
