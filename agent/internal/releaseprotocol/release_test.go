package releaseprotocol

import (
	"bytes"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/sigstore/sigstore/pkg/signature"
	"github.com/theupdateframework/go-tuf/v2/metadata"
)

type fixture struct {
	now       time.Time
	bootstrap []byte
	rootKeys  []ed25519.PrivateKey
	online    map[string]ed25519.PrivateKey
	roots     [][]byte
	artifacts map[string][]byte
	policy    Policy
}

func key(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	_, k, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	return k
}
func signed[T metadata.RootType | metadata.TimestampType | metadata.SnapshotType | metadata.TargetsType](t *testing.T, m *metadata.Metadata[T], keys ...ed25519.PrivateKey) []byte {
	t.Helper()
	for _, k := range keys {
		s, e := signature.LoadSigner(k, crypto.Hash(0))
		if e != nil {
			t.Fatal(e)
		}
		if _, e = m.Sign(s); e != nil {
			t.Fatal(e)
		}
	}
	b, e := m.ToBytes(false)
	if e != nil {
		t.Fatal(e)
	}
	return b
}
func rootBytes(t *testing.T, now time.Time, version int64, roots []ed25519.PrivateKey, online map[string]ed25519.PrivateKey, signers ...ed25519.PrivateKey) []byte {
	t.Helper()
	m := metadata.Root(now.Add(24 * time.Hour))
	m.Signed.Version = version
	m.Signed.Roles["root"].Threshold = 2
	for _, k := range roots {
		pub, e := metadata.KeyFromPublicKey(k.Public())
		if e != nil {
			t.Fatal(e)
		}
		if e = m.Signed.AddKey(pub, "root"); e != nil {
			t.Fatal(e)
		}
	}
	for role, k := range online {
		pub, e := metadata.KeyFromPublicKey(k.Public())
		if e != nil {
			t.Fatal(e)
		}
		if e = m.Signed.AddKey(pub, role); e != nil {
			t.Fatal(e)
		}
	}
	return signed(t, m, signers...)
}
func fresh(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{now: time.Now().UTC().Truncate(time.Second), rootKeys: []ed25519.PrivateKey{key(t), key(t)}, online: map[string]ed25519.PrivateKey{}, artifacts: map[string][]byte{}}
	for _, role := range []string{"timestamp", "snapshot", "targets"} {
		f.online[role] = key(t)
	}
	f.bootstrap = rootBytes(t, f.now, 1, f.rootKeys, f.online, f.rootKeys...)
	f.policy = Policy{BootstrapRootSHA256: hash(f.bootstrap), Channel: "pilot", Registry: "registry.fixture.example", RepositoryPrefix: "installation", SignerIssuer: "https://token.actions.githubusercontent.com", SignerIdentity: "https://github.com/Assyauq26/Gheverhan/.github/workflows/release.yml@refs/tags/v1.0.0", MinimumRootThreshold: 2, MaxArtifactBytes: 8 << 20}
	for _, name := range []string{"app.tar.gz", "app.bundle.json", "migration.tar.gz", "migration.bundle.json"} {
		f.artifacts["artifacts/"+name] = []byte("synthetic signed target payload " + name)
	}
	return f
}
func (f *fixture) manifest() Manifest {
	return Manifest{ImageConfigSHA256: strings.Repeat("c", 64), MigrationConfigSHA256: strings.Repeat("d", 64), SchemaVersion: "1", ReleaseID: "rel-1.0.0-pilot", Sequence: 1, AppVersion: "1.0.0", Channel: "pilot", OS: "ubuntu:24.04", Platform: "linux/amd64", Image: "registry.fixture.example/installation/app@sha256:" + strings.Repeat("a", 64), MigrationImage: "registry.fixture.example/installation/migration@sha256:" + strings.Repeat("b", 64), ImageArchiveTarget: "artifacts/app.tar.gz", ImageBundleTarget: "artifacts/app.bundle.json", MigrationArchiveTarget: "artifacts/migration.tar.gz", MigrationBundleTarget: "artifacts/migration.bundle.json", SignerIssuer: f.policy.SignerIssuer, SignerIdentity: f.policy.SignerIdentity, MinAgentVersion: "0.1.0", MaxAgentVersion: "0.9.0", ProtocolVersion: 1, ComposeTemplateVersion: 1, MinStoreSchemaVersion: 20, MaxStoreSchemaVersion: 21, TargetSchemaVersion: 21, MigrationPolicy: "compatible_expand_only", NotBefore: f.now.Add(-time.Minute), ExpiresAt: f.now.Add(time.Hour), RequiresBackup: true, RequiresOperatorApproval: true}
}
func fileMeta(raw []byte, v int64) *metadata.MetaFiles {
	sum := sha256.Sum256(raw)
	return &metadata.MetaFiles{Version: v, Length: int64(len(raw)), Hashes: metadata.Hashes{"sha256": sum[:]}}
}
func (f *fixture) bundle(t *testing.T, m Manifest, v int64, expiry time.Time) Bundle {
	t.Helper()
	raw, e := json.Marshal(m)
	if e != nil {
		t.Fatal(e)
	}
	return f.bundleRaw(t, raw, v, expiry)
}
func (f *fixture) bundleRaw(t *testing.T, raw []byte, v int64, expiry time.Time) Bundle {
	t.Helper()
	targets := metadata.Targets(expiry)
	targets.Signed.Version = v
	all := map[string][]byte{"channels/pilot/release.json": raw}
	for name, b := range f.artifacts {
		all[name] = b
	}
	for name, b := range all {
		tf, e := metadata.TargetFile().FromBytes(name, b, "sha256")
		if e != nil {
			t.Fatal(e)
		}
		targets.Signed.Targets[name] = tf
	}
	rawTargets := signed(t, targets, f.online["targets"])
	snapshot := metadata.Snapshot(expiry)
	snapshot.Signed.Version = v
	snapshot.Signed.Meta["targets.json"] = fileMeta(rawTargets, v)
	rawSnapshot := signed(t, snapshot, f.online["snapshot"])
	timestamp := metadata.Timestamp(expiry)
	timestamp.Signed.Version = v
	timestamp.Signed.Meta["snapshot.json"] = fileMeta(rawSnapshot, v)
	rawTimestamp := signed(t, timestamp, f.online["timestamp"])
	return Bundle{BootstrapRoot: f.bootstrap, RootUpdates: f.roots, Timestamp: rawTimestamp, Snapshot: rawSnapshot, Targets: rawTargets, Manifest: raw}
}
func TestAuthenticatedReleaseCompatibilityAndStreaming(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	b := f.bundle(t, m, 1, f.now.Add(time.Hour))
	r, state, e := Verify(f.policy, b, State{}, f.now)
	if e != nil {
		t.Fatal(e)
	}
	if state.HighestReleaseSequence != 1 || r.SHA256() != hash(b.Manifest) {
		t.Fatal("trust state")
	}
	// Round-trip persisted public trust state must preserve rollback protections.
	saved, _ := json.Marshal(state)
	var reloaded State
	if json.Unmarshal(saved, &reloaded) != nil {
		t.Fatal("state JSON")
	}
	if _, _, e = Verify(f.policy, b, reloaded, f.now.Add(time.Second)); e != nil {
		t.Fatal("idempotent trusted release", e)
	}
	host := Host{OS: "ubuntu:24.04", Platform: "linux/amd64", AgentVersion: "0.1.0", ProtocolVersion: 1, ComposeTemplateVersion: 1, SchemaVersion: 20}
	if r.Compatible(host) != nil {
		t.Fatal("compatible host")
	}
	for _, mutate := range []func(*Host){func(h *Host) { h.SchemaVersion = 22 }, func(h *Host) { h.AgentVersion = "0.0.9" }, func(h *Host) { h.AgentVersion = "1.0.0" }, func(h *Host) { h.ProtocolVersion = 2 }, func(h *Host) { h.Platform = "linux/arm64" }, func(h *Host) { h.OS = "ubuntu:22.04" }} {
		h := host
		mutate(&h)
		if r.Compatible(h) == nil {
			t.Fatal("incompatible host accepted")
		}
	}
	for name, data := range f.artifacts {
		if r.VerifyTarget(name, bytes.NewReader(data)) != nil {
			t.Fatal("valid target")
		}
		if r.VerifyTarget(name, bytes.NewReader(append(clone(data), 'x'))) == nil {
			t.Fatal("overlong target")
		}
		if r.VerifyTarget(name, bytes.NewReader(data[:len(data)-1])) == nil {
			t.Fatal("truncated target")
		}
		bad := clone(data)
		bad[0] ^= 1
		if r.VerifyTarget(name, bytes.NewReader(bad)) == nil {
			t.Fatal("tampered target")
		}
	}
	if r.VerifyTarget("../../secret", bytes.NewReader(nil)) == nil {
		t.Fatal("unlisted target")
	}
	// Caller mutation of returned Manifest cannot alter the verified receipt.
	returned := r.Manifest()
	returned.Image = "attacker.example/x@sha256:" + strings.Repeat("a", 64)
	if r.Manifest().Image != m.Image {
		t.Fatal("mutable receipt")
	}
}
func TestReleaseRejectsWrongRootTamperExpiryRollbackEquivocationAndClock(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	b := f.bundle(t, m, 2, f.now.Add(time.Hour))
	_, state, e := Verify(f.policy, b, State{}, f.now)
	if e != nil {
		t.Fatal(e)
	}
	bad := f.policy
	bad.BootstrapRootSHA256 = strings.Repeat("0", 64)
	if _, _, e = Verify(bad, b, State{}, f.now); e == nil {
		t.Fatal("wrong root")
	}
	changed := b
	changed.Manifest = append(clone(b.Manifest), ' ')
	if _, _, e = Verify(f.policy, changed, State{}, f.now); e == nil {
		t.Fatal("manifest tamper")
	}
	if _, _, e = Verify(f.policy, f.bundle(t, m, 1, f.now.Add(time.Hour)), state, f.now); e == nil {
		t.Fatal("metadata rollback")
	}
	if _, _, e = Verify(f.policy, f.bundle(t, m, 2, f.now.Add(2*time.Hour)), state, f.now); e == nil {
		t.Fatal("same-version equivocation")
	}
	if _, _, e = Verify(f.policy, b, state, f.now.Add(-3*time.Minute)); e == nil {
		t.Fatal("clock rollback")
	}
	if _, _, e = Verify(f.policy, b, State{}, f.now.Add(2*time.Hour)); e == nil {
		t.Fatal("expired metadata")
	}
	freshMeta := f.bundle(t, m, 3, f.now.Add(2*time.Hour))
	if _, _, e = Verify(f.policy, freshMeta, state, f.now.Add(time.Second)); e != nil {
		t.Fatal("valid metadata refresh", e)
	}
	m.Image = "registry.fixture.example/installation/app@sha256:" + strings.Repeat("c", 64)
	if _, _, e = Verify(f.policy, f.bundle(t, m, 4, f.now.Add(time.Hour)), state, f.now); e == nil {
		t.Fatal("release sequence equivocation")
	}
	m.Sequence = 2
	if _, _, e = Verify(f.policy, f.bundle(t, m, 4, f.now.Add(time.Hour)), state, f.now); e != nil {
		t.Fatal("valid next release", e)
	}
}
func TestReleaseRejectsSignedUnsafeManifestAndUnknownFields(t *testing.T) {
	f := fresh(t)
	for name, mutate := range map[string]func(*Manifest){"revoked": func(m *Manifest) { m.Revoked = true }, "tag": func(m *Manifest) { m.Image = "registry.fixture.example/installation/app:latest" }, "wrong repository": func(m *Manifest) { m.Image = "registry.fixture.example/other/app@sha256:" + strings.Repeat("a", 64) }, "wrong registry": func(m *Manifest) { m.Image = "evil.example/installation/app@sha256:" + strings.Repeat("a", 64) }, "wrong signer": func(m *Manifest) { m.SignerIdentity = "https://evil.example/workflow" }, "future": func(m *Manifest) { m.NotBefore = f.now.Add(time.Hour) }, "expired": func(m *Manifest) { m.ExpiresAt = f.now.Add(-time.Second) }, "downgrade schema": func(m *Manifest) { m.TargetSchemaVersion = 19 }, "destructive migration": func(m *Manifest) { m.MigrationPolicy = "drop_schema" }, "wide lifetime": func(m *Manifest) { m.ExpiresAt = f.now.Add(8 * 24 * time.Hour) }, "remote command path": func(m *Manifest) { m.ImageArchiveTarget = "/bin/sh" }, "agent range": func(m *Manifest) { m.MinAgentVersion = "2.0.0" }, "operator waiver": func(m *Manifest) { m.RequiresOperatorApproval = false }} {
		t.Run(name, func(t *testing.T) {
			m := f.manifest()
			mutate(&m)
			if _, _, e := Verify(f.policy, f.bundle(t, m, 1, f.now.Add(time.Hour)), State{}, f.now); e == nil {
				t.Fatal("unsafe signed release accepted")
			}
		})
	}
	raw, _ := json.Marshal(f.manifest())
	raw = append(raw[:len(raw)-1], []byte(`,"command":"sh -c unapproved"}`)...)
	if _, _, e := Verify(f.policy, f.bundleRaw(t, raw, 1, f.now.Add(time.Hour)), State{}, f.now); e == nil {
		t.Fatal("unknown command")
	}
}
func TestThresholdRootRotationRevokesOldKeysAndRejectsSkippedRoot(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	before := f.bundle(t, m, 1, f.now.Add(time.Hour))
	_, state, e := Verify(f.policy, before, State{}, f.now)
	if e != nil {
		t.Fatal(e)
	}
	oldKeys := f.rootKeys
	newKeys := []ed25519.PrivateKey{key(t), key(t)}
	newOnline := map[string]ed25519.PrivateKey{}
	for _, role := range []string{"timestamp", "snapshot", "targets"} {
		newOnline[role] = key(t)
	}
	signers := append(append([]ed25519.PrivateKey{}, oldKeys...), newKeys...)
	rotation := rootBytes(t, f.now, 2, newKeys, newOnline, signers...)
	f.rootKeys = newKeys
	f.online = newOnline
	f.roots = [][]byte{rotation}
	m.Sequence = 2
	after := f.bundle(t, m, 2, f.now.Add(time.Hour))
	_, next, e := Verify(f.policy, after, state, f.now)
	if e != nil || next.RootVersion != 2 {
		t.Fatal("threshold root rotation", e)
	}
	oldSigned := before
	oldSigned.RootUpdates = f.roots
	if _, _, e = Verify(f.policy, oldSigned, state, f.now); e == nil {
		t.Fatal("revoked online keys accepted")
	}
	// A fresh install must also authenticate the whole sequential root chain.
	if _, _, e = Verify(f.policy, after, State{}, f.now); e != nil {
		t.Fatal("new install verified rotation", e)
	}
	skipped := rootBytes(t, f.now, 3, newKeys, newOnline, signers...)
	after.RootUpdates = [][]byte{skipped}
	if _, _, e = Verify(f.policy, after, state, f.now); e == nil {
		t.Fatal("skipped intermediate root")
	}
	// Threshold2 cannot be bypassed by one of the two old/new signers.
	underSigned := rootBytes(t, f.now, 2, newKeys, newOnline, oldKeys[0], newKeys[0])
	after.RootUpdates = [][]byte{underSigned}
	if _, _, e = Verify(f.policy, after, state, f.now); e == nil {
		t.Fatal("root quorum bypass")
	}
}
