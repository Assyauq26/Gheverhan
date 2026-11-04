package releaseprotocol

import "testing"

func TestSignedMinimumUbuntuReleaseCompatibility(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	m.OS = "ubuntu:22.04"
	if validateManifest(f.policy, m, f.now) != nil {
		t.Fatal("approved minimum rejected")
	}
	release := TrustedRelease{manifest: m, digest: "signed-fixture"}
	host := Host{OS: "ubuntu:22.04", Platform: "linux/amd64", AgentVersion: "0.1.0", ProtocolVersion: 1, ComposeTemplateVersion: 1, SchemaVersion: 20}
	for _, os := range []string{"ubuntu:22.04", "ubuntu:24.04"} {
		host.OS = os
		if release.Compatible(host) != nil {
			t.Fatal("supported OS rejected", os)
		}
	}
	for _, os := range []string{"ubuntu:20.04", "ubuntu:26.04", "debian:12", "ubuntu:22.10"} {
		host.OS = os
		if release.Compatible(host) == nil {
			t.Fatal("unapproved OS accepted", os)
		}
		bad := m
		bad.OS = os
		if validateManifest(f.policy, bad, f.now) == nil {
			t.Fatal("unsupported signed minimum accepted", os)
		}
	}
	// A release signed specifically for24.04 still cannot be installed on22.04.
	release.manifest.OS = "ubuntu:24.04"
	host.OS = "ubuntu:22.04"
	if release.Compatible(host) == nil {
		t.Fatal("signed minimum ignored")
	}
}
