//go:build !linux

package bootstrap

import (
	"errors"
	"os"
)

func lockFile(f *os.File) error { return errors.New("Ubuntu Linux required") }
func unlockFile(f *os.File)     {}
