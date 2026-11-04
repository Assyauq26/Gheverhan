package installer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type vmFixtureTemplates struct{}

func (vmFixtureTemplates) ReadFile(name string) ([]byte, error) {
	if name == "templates/Caddyfile" {
		return []byte("{\n admin off\n}\nstore.fixture.example {\n tls internal\n reverse_proxy app:3000\n}\n"), nil
	}
	return embeddedTemplates.ReadFile(name)
}
func TestFullVMInstaller(t *testing.T) {
	if os.Getenv("P0_FULL_VM_FIXTURE") != "isolated-full-seller" {
		t.Skip("disposable VM only")
	}
	hostname, _ := os.Hostname()
	if hostname != "p0-resource-fixture" || os.Getuid() != 0 {
		t.Fatal("marked root VM required")
	}
	if _, e := os.Stat("/run/p0-ci-fixture"); e != nil {
		t.Fatal("marker required")
	}
	templates = vmFixtureTemplates{}
	defer func() { templates = embeddedTemplates }()
	raw, e := os.ReadFile("/opt/p0-payload/installation-id")
	if e != nil {
		t.Fatal("private installation ID required")
	}
	id := strings.TrimSpace(string(raw))
	s, e := bootstrap.OpenState("/var/lib/jetseller-agent", id)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	o := Options{State: s, StateDirectory: "/var/lib/jetseller-agent", PolicyFile: "/opt/p0-payload/policy.json", ReleaseDirectory: "/var/lib/jetseller-agent/release", ControlOrigin: "https://127.0.0.1:3443", Confirmation: id}
	ctx := context.Background()
	switch os.Getenv("P0_FULL_VM_ACTION") {
	case "fetch":
		e = FetchRelease(ctx, o)
	case "first-install":
		e = Install(ctx, o)
		if !errors.Is(e, ErrHTTPSPending) {
			t.Fatal("expected initial untrusted fixture CA checkpoint", e)
		}
		return
	case "install":
		e = Install(ctx, o)
	case "activate":
		e = ActivateAdmin(ctx, s, o.StateDirectory, id)
	default:
		t.Fatal("fixed action required")
	}
	if e != nil {
		var j journal
		_ = s.ReadInstallRecord(bootstrap.InstallJournalRecord, &j)
		t.Logf("VM_CHECKPOINT next=%d reported=%d", j.Next, j.Reported)
		t.Fatal("full VM operation failed", e)
	}
}

func TestP0PublicationFixtureVerification(t *testing.T) {
	if os.Getenv("P0_PUBLICATION_VERIFY_FIXTURE") != "isolated-full-seller" {
		t.Skip("explicit fixture diagnostics")
	}
	if os.Getuid() != 0 || os.Getenv("GITHUB_ACTIONS") != "true" {
		t.Fatal("root CI fixture only")
	}
	p, e := loadPolicy("/opt/p0-payload/policy.json")
	if e != nil {
		t.Fatal("POLICY", e)
	}
	b, e := loadBundle("/opt/p0-payload", p.Trust.Channel)
	if e != nil {
		t.Fatal("METADATA_READ", e)
	}
	r, _, e := releaseprotocol.Verify(p.Trust, b, releaseprotocol.State{}, time.Now())
	if e != nil {
		t.Fatal("TUF", e)
	}
	m := r.Manifest()
	var total, largest uint64
	for _, item := range []struct{ archive, bundle string }{{m.ImageArchiveTarget, m.ImageBundleTarget}, {m.MigrationArchiveTarget, m.MigrationBundleTarget}} {
		target := filepath.Join("/opt/p0-payload", item.archive)
		proof := filepath.Join("/opt/p0-payload", item.bundle)
		n, e := r.TargetSize(item.archive)
		if e != nil {
			t.Fatal("TARGET_SIZE", e)
		}
		total += uint64(n)
		if uint64(n) > largest {
			largest = uint64(n)
		}
		t.Logf("PUBLIC_ARTIFACT_BYTES %s %d", item.archive, n)
		f, e := os.Open(target)
		if e != nil {
			t.Fatal("TARGET_READ", e)
		}
		h := sha256.New()
		e = r.VerifyTarget(item.archive, io.TeeReader(f, h))
		f.Close()
		if e != nil {
			t.Fatal("TARGET_HASH", e)
		}
		raw, e := protectedRead(proof, 4<<20, false)
		if e != nil || r.VerifyTarget(item.bundle, bytes.NewReader(raw)) != nil {
			t.Fatal("PROOF_TARGET")
		}
		cmd := exec.Command(p.VerifierPath, "verify-blob", "--offline", "--bundle", proof, "--certificate-identity", p.Trust.SignerIdentity, "--certificate-oidc-issuer", p.Trust.SignerIssuer, target)
		out, e := cmd.CombinedOutput()
		if len(out) > 16384 {
			out = out[:16384]
		}
		t.Log(string(out))
		if e != nil {
			t.Fatal("STANDARD_COSIGN", e)
		}
		if e = bootstrap.VerifyReleaseArtifact(context.Background(), bootstrap.VerifyPolicy{VerifierPath: p.VerifierPath, VerifierSHA256: p.VerifierSHA256, CertificateIdentity: p.Trust.SignerIdentity, OIDCIssuer: p.Trust.SignerIssuer}, target, proof, hex.EncodeToString(h.Sum(nil)), p.Trust.MaxArtifactBytes, "/opt/p0-payload"); e != nil {
			t.Fatal("ISOLATED_PINNED_COSIGN", e)
		}
	}
	st, e := os.Stat(p.VerifierPath)
	if e != nil {
		t.Fatal(e)
	}
	t.Logf("DOWNLOAD_BUDGET need=%d allowed=%d", total+largest+uint64(st.Size())+(32<<20), p.Budget.DownloadBytes)
}
