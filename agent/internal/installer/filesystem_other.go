//go:build !linux

package installer

func sameFilesystem(stateDirectory, dockerRootDirectory string) error { return ErrInstall }
