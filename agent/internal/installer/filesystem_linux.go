//go:build linux

package installer

import "syscall"

// The initial P0 budget is a single-filesystem budget. Do not count free bytes
// from /opt while Docker images, database and media fill a different device.
// Custom split-disk/quota layouts require separately measured budgets.
func sameFilesystem(stateDirectory, dockerRootDirectory string) error {
	if protectedDirectory(stateDirectory) != nil || protectedDirectory(dockerRootDirectory) != nil {
		return ErrInstall
	}
	var state, docker syscall.Stat_t
	if syscall.Stat(stateDirectory, &state) != nil || syscall.Stat(dockerRootDirectory, &docker) != nil || state.Dev != docker.Dev {
		return ErrInstall
	}
	return nil
}
