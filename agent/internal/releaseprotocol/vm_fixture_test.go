package releaseprotocol

import (
	"encoding/json"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Ephemeral fixture roots are generated in memory only, never production custody.
func TestBuildFullVMFixture(t *testing.T) {
	dir := os.Getenv("P0_FULL_VM_PAYLOAD")
	if dir == "" {
		t.Skip("explicit disposable payload only")
	}
	if os.Getenv("GITHUB_ACTIONS") != "true" || !filepath.IsAbs(dir) {
		t.Fatal("CI fixture required")
	}
	f := fresh(t)
	f.policy.SignerIdentity = os.Getenv("P0_FIXTURE_SIGNER_IDENTITY")
	f.policy.MaxArtifactBytes = 2 << 30
	m := f.manifest()
	m.OS = "ubuntu:22.04"
	m.SignerIdentity = f.policy.SignerIdentity
	m.RequiresBackup = false
	m.MinStoreSchemaVersion = 0
	m.MaxStoreSchemaVersion = 100
	m.TargetSchemaVersion = 20
	m.ExpiresAt = f.now.Add(time.Hour)
	read := func(name string) string {
		b, e := os.ReadFile(filepath.Join(dir, name))
		if e != nil {
			t.Fatal(e)
		}
		return strings.TrimSpace(string(b))
	}
	m.ImageArchiveSHA256 = read("app-archive-manifest-digest")
	m.MigrationArchiveSHA256 = read("migration-archive-manifest-digest")
	m.ImageConfigSHA256 = strings.TrimPrefix(read("app-config-digest"), "sha256:")
	m.MigrationConfigSHA256 = strings.TrimPrefix(read("migration-config-digest"), "sha256:")
	// These OCI reference names are synthetic; real archive/config digests are verified.
	m.Image = "registry.fixture.example/installation/app@sha256:" + m.ImageConfigSHA256
	m.MigrationImage = "registry.fixture.example/installation/migration@sha256:" + m.MigrationConfigSHA256
	f.policy.Mode = KeylessMode
	f.policy.BootstrapRootSHA256 = ""
	f.policy.MinimumRootThreshold = 0
	f.policy.ExpectedSourceSHA = read("source-sha")
	f.policy.MinimumReleaseSequence = 1
	targets := map[string]*metadata.TargetFiles{}
	for _, name := range []string{m.ImageArchiveTarget, m.ImageBundleTarget, m.MigrationArchiveTarget, m.MigrationBundleTarget} {
		tf, e := metadata.TargetFile().FromFile(filepath.Join(dir, name), "sha256")
		if e != nil {
			t.Fatal(e)
		}
		targets[name] = tf
	}
	rawManifest, e := PrepareKeyless(f.policy, m, targets, State{}, f.now)
	if e != nil {
		t.Fatal(e)
	}
	files := map[string][]byte{"channels/pilot/release.json": rawManifest}
	for name, data := range files {
		file := filepath.Join(dir, name)
		if e = os.MkdirAll(filepath.Dir(file), 0700); e != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(file, data, 0600); e != nil {
			t.Fatal(e)
		}
	}
	policy := map[string]any{"version": 2, "artifact_origin": "https://127.0.0.1:3443", "trust": f.policy, "verifier_path": "/opt/p0-payload/cosign", "verifier_sha256": read("cosign-sha256"), "disk_budget": map[string]uint64{"download_bytes": 2 << 30, "expanded_bytes": 4 << 30, "update_bytes": 6 << 30, "database_bytes": 4 << 30, "media_bytes": 4 << 30, "reserve_bytes": 4 << 30}}
	raw, _ := json.Marshal(policy)
	if e = os.WriteFile(filepath.Join(dir, "policy.json"), raw, 0600); e != nil {
		t.Fatal(e)
	}
}
