package bootstrap

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type interruptedDocker struct {
	dockerRunner
	failed               bool
	database, migrations int
	calls                int
}

func (r *interruptedDocker) run(ctx context.Context, args ...string) ([]byte, error) {
	r.calls++
	joined := strings.Join(args, " ")
	if strings.Contains(joined, " up -d --wait db") {
		r.database++
	}
	if strings.Contains(joined, " run --rm migrate") {
		r.migrations++
	}
	if strings.HasSuffix(joined, "exec -T db sh /opt/jetseller/grant-runtime.sh") && !r.failed {
		r.failed = true
		return nil, ErrProvision
	}
	output, err := r.dockerRunner.run(ctx, args...)
	if strings.Contains(joined, "config --format json") && err == nil {
		var shape struct {
			Networks map[string]map[string]json.RawMessage `json:"networks"`
		}
		if json.Unmarshal(output, &shape) == nil {
			for name, fields := range shape.Networks {
				for key, value := range fields {
					if key != "name" {
						fmt.Printf("fixture network %s field %s type=%T scalar=%s\n", name, key, value, string(value))
					}
				}
			}
		}
	}
	return output, err
}
func TestDisposableTUFProvisioningAndInterruptedResume(t *testing.T) {
	if os.Getenv("JETSELLER_DISPOSABLE_PROVISION_TESTS") != "1" {
		t.Skip("explicit isolated Docker integration only")
	}
	if runtime.GOOS != "linux" || os.Geteuid() != 0 {
		t.Fatal("root inside disposable Ubuntu CI required")
	}
	profile := os.Getenv("JETSELLER_PROVISION_PROFILE")
	if profile == "" {
		t.Fatal("pinned fixture profile required")
	}
	directory, err := os.MkdirTemp("/tmp", "jetseller-runtime.")
	if err != nil {
		t.Fatal(err)
	}
	stack := filepath.Join(directory, "stack")
	image := func(tag string) string {
		output, err := exec.Command("/usr/bin/docker", "image", "inspect", tag, "--format", "{{.Id}}").Output()
		if err != nil {
			t.Fatal("fixture image unavailable")
		}
		return strings.TrimSpace(string(output))
	}
	app, migrate := image("jetseller-fixture:app"), image("jetseller-fixture:migration")
	if output, err := exec.Command("node", filepath.Join(profile, "deploy/self-hosted/prepare.mjs"), "fixture", stack, "store.fixture.example", app, migrate).CombinedOutput(); err != nil {
		t.Fatal("fixture generation failed", string(output))
	}
	// Test CA only. This is not public DNS/ACME approval or public HTTPS proof.
	if os.WriteFile(filepath.Join(stack, "Caddyfile"), []byte("{\n admin off\n}\nstore.fixture.example {\n tls internal\n reverse_proxy app:3000\n}\n"), 0600) != nil {
		t.Fatal("Caddy fixture")
	}
	marker, _ := os.ReadFile(filepath.Join(stack, ".jetseller-disposable"))
	var identity struct {
		Installation string `json:"installation"`
	}
	if json.Unmarshal(marker, &identity) != nil {
		t.Fatal("identity")
	}
	state, err := OpenState(filepath.Join(directory, "state"), identity.Installation)
	if err != nil {
		t.Fatal(err)
	}
	defer state.Close()
	if _, err := OpenState(filepath.Join(directory, "state"), identity.Installation); err == nil {
		t.Fatal("concurrent provisioning lock bypass")
	}
	lockData, err := os.ReadFile(filepath.Join(profile, "deploy/self-hosted/images.lock.json"))
	if err != nil {
		t.Fatal("image locks")
	}
	var locks map[string]struct {
		Image string `json:"image"`
	}
	if json.Unmarshal(lockData, &locks) != nil {
		t.Fatal("image lock schema")
	}
	plan := FixturePlan{Version: 1, InstallationID: identity.Installation, Platform: "linux/amd64", AppImage: app, MigrationImage: migrate, DatabaseImage: locks["postgres"].Image, ProxyImage: locks["caddy"].Image, Files: map[string]string{}}
	for _, name := range provisionFiles {
		raw, err := os.ReadFile(filepath.Join(stack, name))
		if err != nil {
			t.Fatal("fixture input")
		}
		plan.Files[name] = digestBytes(raw)
	}
	repo := newTestTUF(t)
	repo.write(t, plan, 1, time.Now().Add(time.Hour))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	runner := &interruptedDocker{dockerRunner: localDocker{}}
	firstErr := applyDisposableFixture(ctx, state, stack, repo.directory, repo.pin, runner)
	if firstErr == nil {
		t.Fatal("injected interruption not observed")
	}
	if !runner.failed {
		t.Fatalf("provisioning stopped before the intended injected interruption; fixed Docker calls=%d: %v", runner.calls, firstErr)
	}
	journalRaw, err := state.readPrivate("fixture-provision.json", 4096)
	if err != nil {
		t.Fatal("checkpoint absent")
	}
	var journal provisionJournal
	if json.Unmarshal(journalRaw, &journal) != nil || journal.Next != 2 {
		t.Fatal("wrong interruption checkpoint")
	}
	staged := filepath.Join(state.root.Name(), "fixture-"+journal.PlanSHA)
	compose := []string{"compose", "--project-directory", staged, "--env-file", filepath.Join(staged, ".env"), "-f", filepath.Join(staged, "compose.yml")}
	t.Cleanup(func() {
		localDocker{}.run(context.Background(), append(compose, "stop")...) /* own fixture only; retain volumes */
	})
	if err := applyDisposableFixture(ctx, state, stack, repo.directory, repo.pin, runner); err != nil {
		t.Fatal("resume failed", err)
	}
	if runner.database != 1 || runner.migrations != 1 {
		t.Fatal("completed DB/migration checkpoint replayed")
	}
	// Real app storage persistence and exact same-plan resume; no reset/cleanup.
	_, err = localDocker{}.run(ctx, append(append([]string{}, compose...), "exec", "-T", "app", "node", "-e", "require('fs').writeFileSync('/var/lib/jetseller/media/engine-fixture','retained')")...)
	if err != nil {
		t.Fatal("media fixture")
	}
	if err = applyDisposableFixture(ctx, state, stack, repo.directory, repo.pin, runner); err != nil || runner.database != 1 || runner.migrations != 1 {
		t.Fatal("completed plan not idempotent", err)
	}
	_, err = localDocker{}.run(ctx, append(append([]string{}, compose...), "exec", "-T", "app", "node", "-e", "if(require('fs').readFileSync('/var/lib/jetseller/media/engine-fixture','utf8')!=='retained')process.exit(1)")...)
	if err != nil {
		t.Fatal("media lost")
	}
	// A new local TLS server is actually verified by hostname+fixture CA.
	var roots *x509.CertPool
	for attempt := 0; attempt < 30; attempt++ {
		raw, e := localDocker{}.run(ctx, append(append([]string{}, compose...), "exec", "-T", "caddy", "cat", "/data/caddy/pki/authorities/local/root.crt")...)
		roots = x509.NewCertPool()
		if e == nil && roots.AppendCertsFromPEM(raw) {
			break
		}
		time.Sleep(time.Second)
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, "127.0.0.1:443")
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 4 * time.Second}
	response, err := client.Get("https://store.fixture.example/api/v1/ready")
	if err != nil {
		t.Fatal("fixture HTTPS", err)
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("fixture HTTPS readiness")
	}
	// Tampering is rejected before any subsequent Docker command is requested.
	original, _ := os.ReadFile(filepath.Join(stack, "compose.yml"))
	os.WriteFile(filepath.Join(stack, "compose.yml"), append(original, []byte("\n# tamper\n")...), 0600)
	calls := runner.calls
	if err := applyDisposableFixture(ctx, state, stack, repo.directory, repo.pin, runner); err == nil || runner.calls != calls {
		t.Fatal("tampered input reached Docker")
	}
	fmt.Println("Signed TUF fixture chain, real Docker provisioning, interrupted resume, stable volumes and verified internal-CA HTTPS PASS; production delivery and public HTTPS remain gated")
}
