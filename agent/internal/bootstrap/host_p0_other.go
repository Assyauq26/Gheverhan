//go:build !linux

package bootstrap

func InspectP0Host(directory string, budget DiskBudget) (P0HostFacts, error) {
	return P0HostFacts{}, ErrPreflight
}
