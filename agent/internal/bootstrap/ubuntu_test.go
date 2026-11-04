package bootstrap

import (
	"strings"
	"testing"
)

func TestSupportedUbuntuLTSProfilesKeepResourceGates(t *testing.T) {
	for _, version := range []string{"22.04", "24.04"} {
		release, err := ParseOSRelease(strings.NewReader("ID=ubuntu\nVERSION_ID=\"" + version + "\"\n"))
		if err != nil || release != "ubuntu:"+version {
			t.Fatal("supported release rejected", version, err)
		}
		legacy := HostFacts{"linux", "amd64", release, 2, 4 << 30, 40 << 30, 10000, true, false}
		if ValidateHost(legacy) != nil {
			t.Fatal("supported legacy profile rejected", version)
		}
		legacy.MemoryBytes = 2 << 30
		if ValidateHost(legacy) == nil {
			t.Fatal("legacy memory minimum was reduced")
		}
		candidate := validP0Host()
		candidate.Release = release
		if ValidateP0Host(candidate, DefaultP0DiskBudget()) != nil {
			t.Fatal("supported candidate profile rejected", version)
		}
		candidate.FreeBytes = 1
		if ValidateP0Host(candidate, DefaultP0DiskBudget()) == nil {
			t.Fatal("disk budget bypass")
		}
	}
	for _, version := range []string{"20.04", "22.10", "24.10", "26.04", "22.04\"\nID=debian"} {
		if _, err := ParseOSRelease(strings.NewReader("ID=ubuntu\nVERSION_ID=" + version)); err == nil {
			t.Fatal("unapproved OS accepted", version)
		}
	}
}
