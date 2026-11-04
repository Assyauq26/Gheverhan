package bootstrap

import (
	"math"
	"testing"
)

func validP0Host() P0HostFacts {
	return P0HostFacts{HostFacts: HostFacts{OS: "linux", Arch: "amd64", Release: "ubuntu:24.04", CPUs: 2, MemoryBytes: 1900 << 20, FreeBytes: 30 * GiB, FreeInodes: 10000, PortsAvailable: true}, PhysicalMemoryBytes: 2 * GiB, EffectiveMemoryBytes: 1900 << 20, TotalDiskBytes: 40_000_000_000, MemorySource: "smbios-type17", DiskSource: "backing-block-device"}
}
func TestP0ProfileAccountsForPhysicalUsableMemoryAndCompleteDiskBudget(t *testing.T) {
	f := validP0Host()
	budget := DefaultP0DiskBudget()
	if ValidateP0Host(f, budget) != nil {
		t.Fatal("2GiB physical/1900MiB usable/40GB disk rejected")
	}
	if n, e := budget.RequiredFreeBytes(); e != nil || n != 24*GiB {
		t.Fatal("disk budget must include initial release, update, data and reserve")
	}
	if ValidateHost(f.HostFacts) == nil {
		t.Fatal("candidate P0 profile silently relaxed legacy profile")
	}
	cases := map[string]func(*P0HostFacts){
		"one CPU": func(f *P0HostFacts) { f.CPUs = 1 }, "one GiB physical": func(f *P0HostFacts) { f.PhysicalMemoryBytes = GiB },
		"usable RAM too low":         func(f *P0HostFacts) { f.MemoryBytes = 1792<<20 - 1; f.EffectiveMemoryBytes = f.MemoryBytes },
		"cgroup memory quota":        func(f *P0HostFacts) { f.EffectiveMemoryBytes = GiB },
		"quota exceeds measured RAM": func(f *P0HostFacts) { f.EffectiveMemoryBytes = 2 * GiB },
		"unproven physical capacity": func(f *P0HostFacts) { f.PhysicalMemoryBytes = 0; f.MemorySource = "" },
		"disk below marketed 40GB":   func(f *P0HostFacts) { f.TotalDiskBytes = 39_999_999_999 },
		"insufficient budget":        func(f *P0HostFacts) { f.FreeBytes = 24*GiB - 1 },
		"impossible disk facts":      func(f *P0HostFacts) { f.FreeBytes = f.TotalDiskBytes + 1 },
		"inodes":                     func(f *P0HostFacts) { f.FreeInodes = 9999 }, "ports busy": func(f *P0HostFacts) { f.PortsAvailable = false },
		"existing installation": func(f *P0HostFacts) { f.ExistingServices = true }, "wrong OS": func(f *P0HostFacts) { f.Release = "ubuntu:20.04" },
	}
	for name, modify := range cases {
		t.Run(name, func(t *testing.T) {
			f := validP0Host()
			modify(&f)
			if ValidateP0Host(f, budget) == nil {
				t.Fatal("unsafe host accepted")
			}
		})
	}
}
func TestP0BudgetCannotHideReserveOrOverflow(t *testing.T) {
	for _, modify := range []func(*DiskBudget){func(b *DiskBudget) { b.ReserveBytes = 4*GiB - 1 }, func(b *DiskBudget) { b.DatabaseBytes = 1 }, func(b *DiskBudget) { b.MediaBytes = 1 }, func(b *DiskBudget) { b.DownloadBytes = 0 }, func(b *DiskBudget) { b.ExpandedBytes = 0 }, func(b *DiskBudget) { b.UpdateBytes = b.ExpandedBytes }, func(b *DiskBudget) { b.ExpandedBytes = math.MaxUint64 }, func(b *DiskBudget) { b.UpdateBytes = math.MaxUint64 }} {
		b := DefaultP0DiskBudget()
		modify(&b)
		if _, err := b.RequiredFreeBytes(); err == nil {
			t.Fatal("unsafe disk budget accepted")
		}
	}
	b := DefaultP0DiskBudget()
	b.DownloadBytes = 4 * GiB
	b.ExpandedBytes = 8 * GiB
	b.UpdateBytes = 12 * GiB
	if n, e := b.RequiredFreeBytes(); e != nil || n != 36*GiB {
		t.Fatal("larger signed image sizes were not included")
	}
}
