//go:build linux

package bootstrap

import (
	"encoding/binary"
	"encoding/json"
	"os"
	"testing"
)

func TestP0SMBIOSPhysicalMemoryParsing(t *testing.T) {
	record := make([]byte, 34)
	record[0] = 17
	record[1] = 32
	binary.LittleEndian.PutUint16(record[12:14], 2048)
	if physicalMemorySMBIOS(record) != 2*GiB {
		t.Fatal("2GiB memory device not counted")
	}
	binary.LittleEndian.PutUint16(record[12:14], 0x7fff)
	binary.LittleEndian.PutUint32(record[28:32], 2048)
	if physicalMemorySMBIOS(record) != 2*GiB {
		t.Fatal("extended memory device not counted")
	}
	binary.LittleEndian.PutUint16(record[12:14], 0xffff)
	if physicalMemorySMBIOS(record) != 0 {
		t.Fatal("unknown memory must not be rounded up")
	}
	for _, raw := range [][]byte{{17, 0, 0, 0}, {17, 50, 0, 0}, record[:20]} {
		if physicalMemorySMBIOS(raw) != 0 {
			t.Fatal("truncated record accepted")
		}
	}
}
func TestP0CPUSetParser(t *testing.T) {
	for value, want := range map[string]int{"": 0, "0": 1, "0-1": 2, "0-3,8-9": 6} {
		n, e := p0CPUSetCount(value)
		if e != nil || n != want {
			t.Fatal("CPU quota parsing")
		}
	}
	for _, value := range []string{"-1", "2-1", "0-2,1", "a", "0-1-2", "0,"} {
		if _, e := p0CPUSetCount(value); e == nil {
			t.Fatal("invalid cpuset accepted")
		}
	}
}

// Compiled on the CI build host and executed inside the constrained real
// Ubuntu guest. It is not called on a production VPS or an unconstrained
// container, and it never substitutes caller-supplied facts for OS inspection.
func TestP0RealHostEvidence(t *testing.T) {
	if os.Getenv("P0_RESOURCE_PROBE") != "isolated-2-2-40-fixture" {
		t.Skip("explicit isolated guest required")
	}
	state, err := os.MkdirTemp("/root", "p0-resource-")
	if err != nil {
		t.Fatal(err)
	}
	f, err := InspectP0Host(state, DefaultP0DiskBudget())
	raw, e := json.MarshalIndent(struct {
		Facts           P0HostFacts `json:"facts"`
		Budget          DiskBudget  `json:"disk_budget"`
		PreflightPassed bool        `json:"preflight_passed"`
		Evidence        string      `json:"evidence"`
	}{f, DefaultP0DiskBudget(), err == nil, "ISOLATED_QEMU_GUEST_NOT_PUBLIC_VPS"}, "", "  ")
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile("/root/p0-resource-evidence.json", append(raw, '\n'), 0600); e != nil {
		t.Fatal(e)
	}
	if err != nil {
		t.Fatal("P0 guest preflight refused; inspect public resource evidence")
	}
	if f.PhysicalMemoryBytes != 2*GiB || f.CPUs != 2 || f.TotalDiskBytes != 40_000_000_000 {
		t.Fatal("guest does not match the exact constrained profile")
	}
}
