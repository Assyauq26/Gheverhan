package installer

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
)

//go:embed templates/*
var embeddedTemplates embed.FS

// Production always reads the embedded fixed templates. Test substitutions exist only in _test.go.
var templates interface{ ReadFile(string) ([]byte, error) } = embeddedTemplates
var ErrInstall = errors.New("installation blocked; existing database and media preserved")
var ErrHTTPSPending = errors.New("public HTTPS verification pending; preserve installed services")

type Policy struct {
	ArtifactOrigin string                 `json:"artifact_origin"`
	Version        int                    `json:"version"`
	Trust          releaseprotocol.Policy `json:"trust"`
	VerifierPath   string                 `json:"verifier_path"`
	VerifierSHA256 string                 `json:"verifier_sha256"`
	Budget         bootstrap.DiskBudget   `json:"disk_budget"`
}

func strictJSON(b []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if d.Decode(out) != nil || d.Decode(new(any)) != io.EOF {
		return ErrInstall
	}
	return nil
}
func digest(b []byte) string { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
func protectedRead(name string, max int64, private bool) ([]byte, error) {
	if !filepath.IsAbs(name) || filepath.Clean(name) != name || protectedDirectory(filepath.Dir(name)) != nil {
		return nil, ErrInstall
	}
	info, e := os.Lstat(name)
	if e != nil {
		return nil, e
	}
	mask := os.FileMode(0022)
	if private {
		mask = 0077
	}
	if !info.Mode().IsRegular() || !ownedByRoot(info) || info.Mode().Perm()&mask != 0 || info.Size() > max {
		return nil, ErrInstall
	}
	f, e := os.Open(name)
	if e != nil {
		return nil, ErrInstall
	}
	defer f.Close()
	actual, e := f.Stat()
	if e != nil || !os.SameFile(info, actual) {
		return nil, ErrInstall
	}
	b, e := io.ReadAll(io.LimitReader(f, max+1))
	if e != nil || int64(len(b)) > max {
		return nil, ErrInstall
	}
	return b, nil
}
func loadPolicy(file string) (Policy, error) {
	var p Policy
	b, e := protectedRead(file, 65536, true)
	if e != nil || strictJSON(b, &p) != nil || p.Version != 1 || p.VerifierPath == "" || len(p.VerifierSHA256) != 64 {
		return p, ErrInstall
	}
	if _, e = p.Budget.RequiredFreeBytes(); e != nil {
		return p, ErrInstall
	}
	return p, nil
}
func loadBundle(directory string, channel string) (releaseprotocol.Bundle, error) {
	var b releaseprotocol.Bundle
	if protectedDirectory(directory) != nil {
		return b, ErrInstall
	}
	var e error
	for name, dest := range map[string]*[]byte{"root.json": &b.BootstrapRoot, "timestamp.json": &b.Timestamp, "snapshot.json": &b.Snapshot, "targets.json": &b.Targets, "channels/" + channel + "/release.json": &b.Manifest} {
		*dest, e = protectedRead(filepath.Join(directory, name), 2<<20, false)
		if e != nil {
			return b, ErrInstall
		}
	}
	// Sequential root updates only, each still verified with old+new quorum.
	var root struct {
		Signed struct {
			Version int `json:"version"`
		} `json:"signed"`
	}
	if json.Unmarshal(b.BootstrapRoot, &root) != nil || root.Signed.Version < 1 {
		return b, ErrInstall
	}
	for n := root.Signed.Version + 1; n <= root.Signed.Version+64; n++ {
		name := filepath.Join(directory, itoa(n)+".root.json")
		raw, e := protectedRead(name, 2<<20, false)
		if os.IsNotExist(e) {
			break
		}
		if e != nil {
			return b, ErrInstall
		}
		b.RootUpdates = append(b.RootUpdates, raw)
	}
	return b, nil
}
func stableFile(name string, b []byte, mode os.FileMode) error {
	return stableOwnedFile(name, b, mode, 0)
}
func stableOwnedFile(name string, b []byte, mode os.FileMode, uid int) error {
	if protectedDirectory(filepath.Dir(name)) != nil {
		return ErrInstall
	}
	info, e := os.Lstat(name)
	if e == nil {
		if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || (!ownedByUID(info, uid) && !ownedByRoot(info)) || info.Size() != int64(len(b)) {
			return ErrInstall
		}
		f, e := os.Open(name)
		if e != nil {
			return ErrInstall
		}
		defer f.Close()
		actual, e := f.Stat()
		if e != nil || !os.SameFile(info, actual) {
			return ErrInstall
		}
		old, e := io.ReadAll(io.LimitReader(f, int64(len(b))+1))
		if e != nil || !bytes.Equal(old, b) {
			return ErrInstall
		}
		return nil
	}
	if !os.IsNotExist(e) {
		return ErrInstall
	}
	f, e := os.CreateTemp(filepath.Dir(name), ".install-pending-")
	if e != nil {
		return ErrInstall
	}
	temp := f.Name()
	defer os.Remove(temp)
	if f.Chmod(mode) != nil {
		f.Close()
		return ErrInstall
	}
	if _, e = f.Write(b); e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e != nil || ce != nil {
		return ErrInstall
	}
	if os.Rename(temp, name) != nil {
		return ErrInstall
	}
	dir, e := os.Open(filepath.Dir(name))
	if e != nil {
		return ErrInstall
	}
	defer dir.Close()
	return dir.Sync()
}
func directory(name string) error {
	if e := os.Mkdir(name, 0700); e != nil && !os.IsExist(e) {
		return ErrInstall
	}
	return protectedDirectory(name)
}
func validDisplayName(s string) bool {
	if !utf8.ValidString(s) || s != strings.TrimSpace(s) || len(s) == 0 || len(s) > 400 || len(utf16.Encode([]rune(s))) > 100 {
		return false
	}
	for _, c := range s {
		if unicode.IsControl(c) {
			return false
		}
	}
	return true
}
func render(s *bootstrap.State, stack, domain, displayName, app, migration string, pgUID int) error {
	if !validDisplayName(displayName) {
		return ErrInstall
	}
	var master struct {
		Seed string `json:"seed"`
	}
	if e := s.ReadInstallRecord(bootstrap.InstallSecretsRecord, &master); bootstrap.IsMissingInstallRecord(e) {
		b := make([]byte, 32)
		if _, e = rand.Read(b); e != nil {
			return ErrInstall
		}
		master.Seed = hex.EncodeToString(b)
		if s.WriteInstallRecord(bootstrap.InstallSecretsRecord, master) != nil {
			return ErrInstall
		}
	} else if e != nil {
		return ErrInstall
	}
	seed, e := hex.DecodeString(master.Seed)
	if e != nil || len(seed) != 32 {
		return ErrInstall
	}
	secret := func(label string) string {
		mac := hmac.New(sha256.New, seed)
		mac.Write([]byte(s.Identity.InstallationID + "\x00" + label))
		return hex.EncodeToString(mac.Sum(nil))
	}
	id := s.Identity.InstallationID
	database := "js_" + strings.ReplaceAll(id, "-", "")
	if directory(stack) != nil || directory(filepath.Join(stack, "private")) != nil {
		return ErrInstall
	}
	for _, name := range []string{"compose.yml", "compose.p0-2-2-40.yml", "Caddyfile", "init-db.sh", "grant-runtime.sh"} {
		b, e := templates.ReadFile("templates/" + name)
		if e != nil || stableFile(filepath.Join(stack, name), b, 0600) != nil {
			return ErrInstall
		}
	}
	config := map[string]string{"JETSELLER_STORE_PROFILE": "self-hosted", "JETSELLER_INSTALLATION_MODE": "new", "JETSELLER_INSTALLATION_ID": id, "JETSELLER_STORE_DOMAIN": domain, "JETSELLER_STORE_DISPLAY_NAME": displayName, "APP_ORIGIN": "https://" + domain, "STORAGE_PROVIDER": "local", "STORAGE_APP_NAME": "js_" + id[:8], "STORAGE_LOCAL_ROOT": "/var/lib/jetseller/media", "DATABASE_URL": "postgresql://js_runtime:" + secret("runtime") + "@db:5432/" + database + "?schema=public", "JETSELLER_MIGRATION_IDENTITY": "js_migrate", "JWT_SECRET": secret("jwt"), "AUTH_COOKIE_NAME": "js_" + id[:8] + "_session", "PASSWORD_RESET_FROM": "Toko <noreply@" + domain + ">", "PASSWORD_RESET_BASE_URL": "https://" + domain, "JNT_CONFIG_SCOPE": "local_store"}
	key, _ := hex.DecodeString(secret("jnt"))
	config["JNT_INTEGRATION_ENCRYPTION_KEY"] = base64.StdEncoding.EncodeToString(key)
	files := map[string][]byte{"bootstrap_password": []byte(secret("bootstrap") + "\n"), "migration_password": []byte(secret("migration") + "\n"), "runtime_password": []byte(secret("runtime") + "\n")}
	files["runtime.json"], _ = json.Marshal(config)
	delete(config, "JNT_CONFIG_SCOPE")
	delete(config, "JNT_INTEGRATION_ENCRYPTION_KEY")
	config["DIRECT_URL"] = "postgresql://js_migrate:" + secret("migration") + "@db:5432/" + database + "?schema=public"
	files["migration.json"], _ = json.Marshal(config)
	for name, b := range files {
		f := filepath.Join(stack, "private", name)
		uid := pgUID
		if strings.HasSuffix(name, ".json") {
			uid = 1000
		}
		if stableOwnedFile(f, b, 0600, uid) != nil {
			return ErrInstall
		}
		if os.Chown(f, uid, uid) != nil {
			return ErrInstall
		}
	}
	env := "COMPOSE_PROJECT_NAME=jsstore_" + strings.ReplaceAll(id, "-", "") + "\nJETSELLER_DATABASE_NAME=" + database + "\nJETSELLER_INSTALLATION_ID=" + id + "\nJETSELLER_STORE_DOMAIN=" + domain + "\nJETSELLER_APP_IMAGE=" + app + "\nJETSELLER_MIGRATION_IMAGE=" + migration + "\n"
	return stableFile(filepath.Join(stack, ".env"), []byte(env), 0600)
}

func checkTemplates(stack string) error {
	for _, name := range []string{"compose.yml", "compose.p0-2-2-40.yml", "Caddyfile", "init-db.sh", "grant-runtime.sh"} {
		expected, e := templates.ReadFile("templates/" + name)
		if e != nil {
			return ErrInstall
		}
		actual, e := protectedRead(filepath.Join(stack, name), 128<<10, true)
		if e != nil || !bytes.Equal(expected, actual) {
			return ErrInstall
		}
	}
	return nil
}
