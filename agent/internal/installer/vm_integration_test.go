package installer

import (
	"context"
	"errors"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"os"
	"strings"
	"testing"
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
