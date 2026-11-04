//go:build !linux

package bootstrap

func ValidateInstallState(s *State) error { return ErrState }
