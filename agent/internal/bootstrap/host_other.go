//go:build !linux

package bootstrap

func InspectHost(directory string) (HostFacts, error) { return HostFacts{}, ErrPreflight }
