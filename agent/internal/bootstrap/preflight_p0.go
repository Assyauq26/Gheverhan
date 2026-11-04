package bootstrap

import "math"

const GiB uint64 = 1 << 30

// P0HostFacts distinguishes installed/allocated RAM from the smaller amount
// exposed by Linux after firmware/kernel reservations. A container quota does
// not prove that a 2 GiB VM was used; the evidence must record both quantities.
type P0HostFacts struct {
	HostFacts
	PhysicalMemoryBytes  uint64 `json:"physical_memory_bytes"`
	EffectiveMemoryBytes uint64 `json:"effective_memory_bytes"`
	TotalDiskBytes       uint64 `json:"total_disk_bytes"`
	MemorySource         string `json:"memory_source"`
	DiskSource           string `json:"disk_source"`
}

// DiskBudget accounts for the current release plus a complete subsequent
// download/expanded copy, initial merchant data and a non-negotiable reserve.
// Signed release image sizes may raise these values, never lower the floors.
type DiskBudget struct {
	DownloadBytes uint64 `json:"download_bytes"`
	ExpandedBytes uint64 `json:"expanded_bytes"`
	UpdateBytes   uint64 `json:"update_bytes"`
	DatabaseBytes uint64 `json:"database_bytes"`
	MediaBytes    uint64 `json:"media_bytes"`
	ReserveBytes  uint64 `json:"reserve_bytes"`
}

func DefaultP0DiskBudget() DiskBudget {
	return DiskBudget{2 * GiB, 4 * GiB, 6 * GiB, 4 * GiB, 4 * GiB, 4 * GiB}
}

func (b DiskBudget) RequiredFreeBytes() (uint64, error) {
	if b.DownloadBytes < GiB || b.ExpandedBytes < 2*GiB || b.DatabaseBytes < 4*GiB || b.MediaBytes < 4*GiB || b.ReserveBytes < 4*GiB || b.DownloadBytes > math.MaxUint64-b.ExpandedBytes || b.UpdateBytes < b.DownloadBytes+b.ExpandedBytes {
		return 0, ErrPreflight
	}
	var total uint64
	for _, n := range []uint64{b.DownloadBytes, b.ExpandedBytes, b.UpdateBytes, b.DatabaseBytes, b.MediaBytes, b.ReserveBytes} {
		if n > math.MaxUint64-total {
			return 0, ErrPreflight
		}
		total += n
	}
	return total, nil
}

// ValidateP0Host is a separately versioned candidate resource profile. Legacy
// ValidateHost remains unchanged until the P0 profile has its own acceptance
// evidence. 1792 MiB is usable RAM, not a claim that 1792 MiB is 2 GiB physical.
func ValidateP0Host(f P0HostFacts, budget DiskBudget) error {
	needed, err := budget.RequiredFreeBytes()
	if err != nil || f.OS != "linux" || f.Arch != "amd64" || f.Release != "ubuntu:24.04" || f.CPUs < 2 || f.PhysicalMemoryBytes < 2*GiB || f.MemoryBytes < 1792<<20 || f.EffectiveMemoryBytes < 1792<<20 || f.EffectiveMemoryBytes > f.MemoryBytes || f.TotalDiskBytes < 40_000_000_000 || f.FreeBytes > f.TotalDiskBytes || f.FreeBytes < needed || f.FreeInodes < 10000 || !f.PortsAvailable || f.ExistingServices || f.MemorySource == "" || f.DiskSource == "" {
		return ErrPreflight
	}
	return nil
}
