package bootstrap

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sigstore/sigstore/pkg/signature"
	"github.com/theupdateframework/go-tuf/v2/metadata"
)

type testTUFRepository struct {
	directory, pin string
	keys           map[string]ed25519.PrivateKey
}

func newTestTUF(t *testing.T) *testTUFRepository {
	t.Helper()
	repo := &testTUFRepository{directory: t.TempDir(), keys: map[string]ed25519.PrivateKey{}}
	root := metadata.Root(time.Now().Add(24 * time.Hour))
	for _, role := range []string{"root", "timestamp", "snapshot", "targets"} {
		_, key, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		repo.keys[role] = key
		public, err := metadata.KeyFromPublicKey(key.Public())
		if err != nil {
			t.Fatal(err)
		}
		if root.Signed.AddKey(public, role) != nil {
			t.Fatal("root role")
		}
	}
	signer, err := signature.LoadSigner(repo.keys["root"], crypto.Hash(0))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = root.Sign(signer); err != nil {
		t.Fatal(err)
	}
	raw, err := root.ToBytes(false)
	if err != nil {
		t.Fatal(err)
	}
	repo.pin = digestBytes(raw)
	if os.WriteFile(filepath.Join(repo.directory, "root.json"), raw, 0600) != nil {
		t.Fatal("root write")
	}
	return repo
}
func (repo *testTUFRepository) write(t *testing.T, plan FixturePlan, version int64, expiry time.Time) {
	t.Helper()
	raw, err := json.Marshal(plan)
	if err != nil {
		t.Fatal(err)
	}
	repo.writeRaw(t, raw, version, expiry)
}
func (repo *testTUFRepository) writeRaw(t *testing.T, raw []byte, version int64, expiry time.Time) {
	t.Helper()
	var err error
	if os.WriteFile(filepath.Join(repo.directory, "fixture-plan.json"), raw, 0600) != nil {
		t.Fatal("plan write")
	}
	target, err := metadata.TargetFile().FromBytes("fixture-plan.json", raw, "sha256")
	if err != nil {
		t.Fatal(err)
	}
	targets := metadata.Targets(expiry)
	targets.Signed.Version = version
	targets.Signed.Targets["fixture-plan.json"] = target
	signer, err := signature.LoadSigner(repo.keys["targets"], crypto.Hash(0))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = targets.Sign(signer); err != nil {
		t.Fatal(err)
	}
	rawTargets, err := targets.ToBytes(false)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := metadata.Snapshot(expiry)
	snapshot.Signed.Version = version
	snapshot.Signed.Meta["targets.json"] = testMetaFile(rawTargets, version)
	signer, err = signature.LoadSigner(repo.keys["snapshot"], crypto.Hash(0))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = snapshot.Sign(signer); err != nil {
		t.Fatal(err)
	}
	rawSnapshot, err := snapshot.ToBytes(false)
	if err != nil {
		t.Fatal(err)
	}
	timestamp := metadata.Timestamp(expiry)
	timestamp.Signed.Version = version
	timestamp.Signed.Meta["snapshot.json"] = testMetaFile(rawSnapshot, version)
	signer, err = signature.LoadSigner(repo.keys["timestamp"], crypto.Hash(0))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = timestamp.Sign(signer); err != nil {
		t.Fatal(err)
	}
	rawTimestamp, err := timestamp.ToBytes(false)
	if err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"targets.json": rawTargets, "snapshot.json": rawSnapshot, "timestamp.json": rawTimestamp} {
		if os.WriteFile(filepath.Join(repo.directory, name), data, 0600) != nil {
			t.Fatal("metadata write")
		}
	}
}
func testMetaFile(raw []byte, version int64) *metadata.MetaFiles {
	sum := sha256.Sum256(raw)
	return &metadata.MetaFiles{Version: version, Length: int64(len(raw)), Hashes: metadata.Hashes{"sha256": sum[:]}}
}
func TestFixtureTUFRejectsTamperExpiryWrongRootAndRollback(t *testing.T) {
	repo := newTestTUF(t)
	plan := FixturePlan{Version: 1, InstallationID: "550e8400-e29b-41d4-a716-446655440000", Platform: "linux/amd64", Files: map[string]string{}}
	repo.write(t, plan, 2, time.Now().Add(time.Hour))
	verified, trust, err := verifyFixtureTUF(repo.directory, repo.pin, fixtureTrust{}, time.Now())
	if err != nil || verified.InstallationID != plan.InstallationID {
		t.Fatal("valid signed chain", err)
	}
	if _, _, err = verifyFixtureTUF(repo.directory, strings.Repeat("0", 64), fixtureTrust{}, time.Now()); err == nil {
		t.Fatal("wrong root accepted")
	}
	os.WriteFile(filepath.Join(repo.directory, "fixture-plan.json"), []byte(`{"version":1}`), 0600)
	if _, _, err = verifyFixtureTUF(repo.directory, repo.pin, fixtureTrust{}, time.Now()); err == nil {
		t.Fatal("target tamper accepted")
	}
	repo.write(t, plan, 1, time.Now().Add(time.Hour))
	if _, _, err = verifyFixtureTUF(repo.directory, repo.pin, trust, time.Now()); err == nil {
		t.Fatal("rollback accepted")
	}
	repo.write(t, plan, 3, time.Now().Add(-time.Minute))
	if _, _, err = verifyFixtureTUF(repo.directory, repo.pin, trust, time.Now()); err == nil {
		t.Fatal("expired chain accepted")
	}
	repo.write(t, plan, 2, time.Now().Add(2*time.Hour))
	if _, _, err = verifyFixtureTUF(repo.directory, repo.pin, trust, time.Now()); err == nil {
		t.Fatal("same-version metadata equivocation accepted")
	}
}
func TestFixtureTUFRejectsUnknownPlanFieldsAndUnsignedMetadata(t *testing.T) {
	unknown := newTestTUF(t)
	unknown.writeRaw(t, []byte(`{"version":1,"command":"sh -c unapproved"}`), 1, time.Now().Add(time.Hour))
	if _, _, err := verifyFixtureTUF(unknown.directory, unknown.pin, fixtureTrust{}, time.Now()); err == nil {
		t.Fatal("signed unknown command field accepted")
	}

	repo := newTestTUF(t)
	plan := FixturePlan{Version: 1}
	repo.write(t, plan, 1, time.Now().Add(time.Hour))
	file := filepath.Join(repo.directory, "timestamp.json")
	raw, _ := os.ReadFile(file)
	timestamp, err := metadata.Timestamp().FromBytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	timestamp.ClearSignatures()
	raw, _ = timestamp.ToBytes(false)
	os.WriteFile(file, raw, 0600)
	if _, _, err = verifyFixtureTUF(repo.directory, repo.pin, fixtureTrust{}, time.Now()); err == nil {
		t.Fatal("unsigned timestamp accepted")
	}
}

func validRenderedFixture(t *testing.T, staged, project string, plan FixturePlan) map[string]any {
	t.Helper()
	services := map[string]any{}
	mounts := map[string][]map[string]any{
		"db":    {{"type": "volume", "source": "db_data", "target": "/var/lib/postgresql/data"}, {"type": "bind", "source": filepath.Join(staged, "init-db.sh"), "target": "/docker-entrypoint-initdb.d/10-jetseller.sh", "read_only": true}, {"type": "bind", "source": filepath.Join(staged, "grant-runtime.sh"), "target": "/opt/jetseller/grant-runtime.sh", "read_only": true}},
		"app":   {{"type": "volume", "source": "media", "target": "/var/lib/jetseller/media"}},
		"caddy": {{"type": "bind", "source": filepath.Join(staged, "Caddyfile"), "target": "/etc/caddy/Caddyfile", "read_only": true}, {"type": "volume", "source": "caddy_data", "target": "/data"}, {"type": "volume", "source": "caddy_config", "target": "/config"}}, "migrate": {}}
	for name, image := range map[string]string{"db": plan.DatabaseImage, "app": plan.AppImage, "migrate": plan.MigrationImage, "caddy": plan.ProxyImage} {
		networks := map[string]any{"database": nil}
		if name == "app" {
			networks["edge"] = nil
			networks["outbound"] = nil
		}
		if name == "caddy" {
			networks = map[string]any{"edge": nil, "outbound": nil}
		}
		service := map[string]any{"image": image, "volumes": mounts[name], "networks": networks}
		if name == "app" || name == "migrate" {
			service["user"] = "1000:1000"
			service["read_only"] = true
			service["cap_drop"] = []string{"ALL"}
			service["security_opt"] = []string{"no-new-privileges:true"}
		}
		if name == "caddy" {
			service["ports"] = []map[string]any{{"target": 80, "published": "80", "protocol": "tcp"}, {"target": 443, "published": "443", "protocol": "tcp"}}
		}
		grants := map[string][]string{"db": {"bootstrap_password", "migration_password", "runtime_password"}, "app": {"runtime_config"}, "migrate": {"migration_config"}, "caddy": {}}
		if len(grants[name]) > 0 {
			list := []map[string]any{}
			for _, source := range grants[name] {
				list = append(list, map[string]any{"source": source, "target": source})
			}
			service["secrets"] = list
		}
		services[name] = service
	}
	volumes := map[string]any{}
	for _, name := range []string{"db_data", "media", "caddy_data", "caddy_config"} {
		volumes[name] = map[string]any{"name": project + "_" + name}
	}
	networks := map[string]any{"database": map[string]any{"name": project + "_database", "internal": true}, "edge": map[string]any{"name": project + "_edge", "internal": true}, "outbound": map[string]any{"name": project + "_outbound"}}
	secrets := map[string]any{}
	for _, name := range []string{"bootstrap_password", "migration_password", "runtime_password", "runtime_config", "migration_config"} {
		file := name
		if strings.HasSuffix(name, "_config") {
			file = strings.TrimSuffix(name, "_config") + ".json"
		}
		secrets[name] = map[string]any{"file": filepath.Join(staged, "private", file)}
	}
	return map[string]any{"name": project, "services": services, "volumes": volumes, "networks": networks, "secrets": secrets}
}
func TestRenderedFixtureRejectsPrivilegedMountCommandPortAndExternalNetwork(t *testing.T) {
	d := "sha256:" + strings.Repeat("a", 64)
	plan := FixturePlan{AppImage: d, MigrationImage: d, DatabaseImage: "postgres@" + d, ProxyImage: "caddy@" + d}
	staged := filepath.Join(t.TempDir(), "staged")
	project := "jsfixture_550e8400"
	good := validRenderedFixture(t, staged, project, plan)
	good["services"].(map[string]any)["app"].(map[string]any)["entrypoint"] = nil
	good["services"].(map[string]any)["app"].(map[string]any)["command"] = nil
	good["networks"].(map[string]any)["database"].(map[string]any)["ipam"] = map[string]any{}
	raw, _ := json.Marshal(good)
	if validateFixtureCompose(raw, staged, project, plan) != nil {
		t.Fatal("valid normalized fixture denied")
	}
	mutations := []func(map[string]any){
		func(c map[string]any) {
			c["networks"].(map[string]any)["database"].(map[string]any)["ipam"] = map[string]any{"config": []any{map[string]any{"subnet": "10.0.0.0/8"}}}
		},
		func(c map[string]any) {
			c["services"].(map[string]any)["app"].(map[string]any)["entrypoint"] = []string{"sh"}
		},
		func(c map[string]any) {
			c["services"].(map[string]any)["app"].(map[string]any)["secrets"] = []map[string]any{{"source": "migration_config", "target": "runtime_config"}}
		},
		func(c map[string]any) {
			c["services"].(map[string]any)["app"].(map[string]any)["secrets"] = []map[string]any{{"source": "runtime_config", "target": "other"}}
		},

		func(c map[string]any) { c["services"].(map[string]any)["app"].(map[string]any)["privileged"] = true },
		func(c map[string]any) {
			c["services"].(map[string]any)["app"].(map[string]any)["command"] = []string{"sh", "-c", "anything"}
		},
		func(c map[string]any) {
			c["services"].(map[string]any)["db"].(map[string]any)["ports"] = []map[string]any{{"target": 5432, "published": "5432", "protocol": "tcp"}}
		},
		func(c map[string]any) {
			c["services"].(map[string]any)["app"].(map[string]any)["volumes"] = []map[string]any{{"type": "bind", "source": "/", "target": "/host"}}
		},
		func(c map[string]any) { c["networks"].(map[string]any)["outbound"].(map[string]any)["external"] = true },
		func(c map[string]any) {
			c["services"].(map[string]any)["db"].(map[string]any)["networks"] = map[string]any{"outbound": nil}
		},
	}
	for _, mutate := range mutations {
		config := validRenderedFixture(t, staged, project, plan)
		mutate(config)
		raw, _ = json.Marshal(config)
		if validateFixtureCompose(raw, staged, project, plan) == nil {
			t.Fatal("unsafe normalized fixture accepted")
		}
	}
}

func TestBoundedInputDistinguishesMissingFromInvalidFile(t *testing.T) {
	target := filepath.Join(t.TempDir(), "not-created")
	if _, err := readBoundedRegular(target, 10); !os.IsNotExist(err) {
		t.Fatal("missing staged file must be creatable")
	}
	if err := os.WriteFile(target, []byte("small"), 0600); err != nil {
		t.Fatal(err)
	}
	if raw, err := readBoundedRegular(target, 10); err != nil || string(raw) != "small" {
		t.Fatal("regular bounded input")
	}
	if _, err := readBoundedRegular(target, 2); err == nil || os.IsNotExist(err) {
		t.Fatal("oversize input must not be treated as missing")
	}
}
