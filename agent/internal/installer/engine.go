package installer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
)

const postgresImage = "postgres@sha256:2cd2c0f809604aaeff6f0ec8f40aecbd025613107561015c69369a1a7f1d3416"
const proxyImage = "caddy@sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a"

var phases = []string{"PREFLIGHT", "VERIFIED_RELEASE", "DATABASE", "MIGRATION", "APPLICATION", "HTTPS_PENDING", "LOCAL_READINESS"}

type Authorization struct {
	BundleURL        string    `json:"release_bundle_url"`
	BundleSHA256     string    `json:"release_bundle_sha256"`
	InstallationID   string    `json:"installation_id"`
	DeviceID         string    `json:"device_id"`
	Domain           string    `json:"domain"`
	DisplayName      string    `json:"display_name"`
	ReleaseID        string    `json:"release_id"`
	ManifestSHA256   string    `json:"manifest_sha256"`
	ExpiresAt        time.Time `json:"expires_at"`
	DomainVerifiedAt time.Time `json:"domain_verified_at"`
}
type journal struct {
	Version        int       `json:"version"`
	InstallationID string    `json:"installation_id"`
	Domain         string    `json:"domain"`
	DisplayName    string    `json:"display_name"`
	ReleaseSHA     string    `json:"release_sha"`
	ReleaseID      string    `json:"release_id"`
	App            string    `json:"app"`
	Migration      string    `json:"migration"`
	Next           int       `json:"next"`
	Reported       int       `json:"reported"`
	Sequence       int       `json:"sequence"`
	Pending        string    `json:"pending"`
	UpdatedAt      time.Time `json:"updated_at"`
}
type Options struct {
	State                                                                     *bootstrap.State
	StateDirectory, PolicyFile, ReleaseDirectory, ControlOrigin, Confirmation string
}
type docker interface {
	run(context.Context, ...string) ([]byte, error)
}
type localDocker struct{}
type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 1<<20 {
		return 0, ErrInstall
	}
	return b.Buffer.Write(p)
}
func (localDocker) run(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Minute)
	defer cancel()
	c := exec.CommandContext(ctx, "/usr/bin/docker", append([]string{"--host", "unix:///var/run/docker.sock"}, args...)...)
	c.Env = []string{"PATH=/usr/bin:/bin", "HOME=/nonexistent", "DOCKER_CONFIG=/nonexistent", "LANG=C.UTF-8"}
	var out boundedOutput
	c.Stdout = &out
	c.Stderr = io.Discard
	if c.Run() != nil {
		return nil, ErrInstall
	}
	return out.Bytes(), nil
}
func itoa(n int) string { return strconv.Itoa(n) }
func validDomain(s string) bool {
	u, e := url.Parse("https://" + s)
	if e != nil || u.Hostname() != s || u.Port() != "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || len(s) > 200 || net.ParseIP(s) != nil {
		return false
	}
	labels := strings.Split(s, ".")
	if len(labels) < 2 {
		return false
	}
	for _, label := range labels {
		if len(label) < 1 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return false
			}
		}
	}
	for _, reserved := range []string{"gheverhan.store", "buattokosendiri.web.id", "jetseller.web.id"} {
		if s == reserved || strings.HasSuffix(s, "."+reserved) {
			return false
		}
	}
	return true
}

func Install(ctx context.Context, o Options) error {
	return install(ctx, o, localDocker{}, &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", "127.0.0.1:443")
	}}, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }})
}
func install(ctx context.Context, o Options, d docker, probe *http.Client) error {
	if bootstrap.ValidateInstallState(o.State) != nil || o.StateDirectory == "" || o.Confirmation != o.State.Identity.InstallationID {
		return ErrInstall
	}
	policy, e := loadPolicy(o.PolicyFile)
	if e != nil {
		return ErrInstall
	}
	client, e := bootstrap.NewPairingClient(o.ControlOrigin)
	if e != nil {
		return e
	}
	credential, e := o.State.PairedCredential()
	if e != nil {
		credential, e = client.RefreshInstallationCredential(ctx, o.State)
	}
	if e != nil || credential.ControlOrigin != o.ControlOrigin {
		return ErrInstall
	}
	authorize := func() (Authorization, error) {
		var a Authorization
		e := client.InstallRequest(ctx, o.State, "GET", "/agent/install-authorization", nil, &a)
		now := time.Now()
		if e != nil || a.InstallationID != o.State.Identity.InstallationID || a.DeviceID != credential.DeviceID || !validDomain(a.Domain) || !validDisplayName(a.DisplayName) || !a.ExpiresAt.After(now) || a.ExpiresAt.After(now.Add(125*time.Second)) || a.DomainVerifiedAt.After(now.Add(5*time.Second)) || a.DomainVerifiedAt.Before(now.Add(-30*time.Minute)) {
			return a, ErrInstall
		}
		return a, nil
	}
	auth, e := authorize()
	if e != nil {
		return e
	}
	var j journal
	e = o.State.ReadInstallRecord(bootstrap.InstallJournalRecord, &j)
	fresh := bootstrap.IsMissingInstallRecord(e)
	if !fresh && (e != nil || j.Version != 1 || j.InstallationID != auth.InstallationID || j.Domain != auth.Domain || j.DisplayName != auth.DisplayName || j.ReleaseSHA != auth.ManifestSHA256 || j.ReleaseID != auth.ReleaseID || j.Next < 0 || j.Next > 8 || j.Reported < 0 || j.Reported > len(phases)) {
		return ErrInstall
	}
	var oldTrust releaseprotocol.State
	if e = o.State.ReadInstallRecord(bootstrap.ReleaseTrustRecord, &oldTrust); e != nil && !bootstrap.IsMissingInstallRecord(e) {
		return ErrInstall
	}
	bundle, e := loadBundle(o.ReleaseDirectory, policy.Trust.Channel)
	if e != nil {
		return e
	}
	trusted, trust, e := releaseprotocol.Verify(policy.Trust, bundle, oldTrust, time.Now())
	if e != nil || trusted.SHA256() != auth.ManifestSHA256 || trusted.Manifest().ReleaseID != auth.ReleaseID {
		return ErrInstall
	}
	manifest := trusted.Manifest()
	var archiveTotal, archiveLargest uint64
	for _, target := range []string{manifest.ImageArchiveTarget, manifest.MigrationArchiveTarget} {
		n, e := trusted.TargetSize(target)
		if e != nil {
			return ErrInstall
		}
		archiveTotal += uint64(n)
		if uint64(n) > archiveLargest {
			archiveLargest = uint64(n)
		}
	}
	verifierInfo, e := os.Stat(policy.VerifierPath)
	if e != nil || verifierInfo.Size() < 1 || archiveTotal+archiveLargest+uint64(verifierInfo.Size())+(32<<20) > policy.Budget.DownloadBytes {
		return ErrInstall
	}

	if !fresh && j.Next >= 1 {
		valid := func(id, config, ref string) bool {
			return id == "sha256:"+config || id == ref[strings.LastIndex(ref, "@")+1:]
		}
		if !valid(j.App, manifest.ImageConfigSHA256, manifest.Image) || !valid(j.Migration, manifest.MigrationConfigSHA256, manifest.MigrationImage) {
			return ErrInstall
		}
	}
	if manifest.RequiresBackup || trusted.Compatible(releaseprotocol.Host{OS: "ubuntu:24.04", Platform: "linux/amd64", AgentVersion: "0.1.0", ProtocolVersion: 1, ComposeTemplateVersion: 1, SchemaVersion: 0}) != nil {
		return ErrInstall
	}
	stack := filepath.Join(o.StateDirectory, "store")
	project := "jsstore_" + strings.ReplaceAll(auth.InstallationID, "-", "")
	save := func() error {
		j.UpdatedAt = time.Now().UTC()
		return o.State.WriteInstallRecord(bootstrap.InstallJournalRecord, j)
	}
	budget := policy.Budget
	facts, _ := bootstrap.InspectP0Host(o.StateDirectory, budget)
	if !fresh && j.Next > 0 {
		// Only this installation's containers may exist on a resumed host. Never
		// make an existing unrelated deployment look like a fresh server.
		if e = onlyOwnedContainers(ctx, d, project, j.App, j.Migration); e != nil {
			return e
		}
		for _, hostPath := range []string{"/etc/caddy/Caddyfile", "/var/lib/postgresql"} {
			if _, e := os.Stat(hostPath); e == nil {
				return ErrInstall
			}
		}
		facts.ExistingServices = false
		if !facts.PortsAvailable {
			raw, e := d.run(ctx, "inspect", "--format", `{{.State.Running}} {{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}`, project+"-caddy-1")
			if e != nil || strings.TrimSpace(string(raw)) != "true "+project+" caddy" {
				return ErrInstall
			}
			facts.PortsAvailable = true
		}
	}
	if bootstrap.ValidateP0Host(facts, budget) != nil {
		return ErrInstall
	}
	dockerRoot, e := d.run(ctx, "info", "--format", "{{.DockerRootDir}}")
	if e != nil || sameFilesystem(o.StateDirectory, strings.TrimSpace(string(dockerRoot))) != nil {
		return ErrInstall
	}
	if _, e = d.run(ctx, "compose", "version", "--short"); e != nil {
		return ErrInstall
	}
	if fresh {
		j = journal{Version: 1, InstallationID: auth.InstallationID, Domain: auth.Domain, DisplayName: auth.DisplayName, ReleaseSHA: trusted.SHA256(), ReleaseID: manifest.ReleaseID}
		if save() != nil {
			return ErrInstall
		}
	}
	if o.State.WriteInstallRecord(bootstrap.ReleaseTrustRecord, trust) != nil {
		return ErrInstall
	}
	report := func(phase string) error {
		idx := -1
		for n, p := range phases {
			if p == phase {
				idx = n
			}
		}
		if idx < 0 {
			return ErrInstall
		}
		if j.Reported > idx {
			return nil
		}
		if j.Reported != idx {
			return ErrInstall
		}
		if j.Pending != "" && j.Pending != phase {
			return ErrInstall
		}
		j.Pending = phase
		if save() != nil {
			return ErrInstall
		}
		payload := map[string]any{"installation_id": j.InstallationID, "release_id": j.ReleaseID, "manifest_sha256": j.ReleaseSHA, "phase": phase, "sequence": j.Sequence + 1, "error_code": nil}
		var receipt struct {
			Accepted bool `json:"accepted"`
			Sequence int  `json:"sequence"`
		}
		if client.InstallRequest(ctx, o.State, "POST", "/agent/install-progress", payload, &receipt) != nil || !receipt.Accepted || receipt.Sequence != j.Sequence+1 {
			return ErrInstall
		}
		j.Sequence++
		j.Reported++
		j.Pending = ""
		return save()
	}
	if e = report("PREFLIGHT"); e != nil {
		return e
	}
	// Reverify expiry/current control approval before every privileged phase.
	freshAuthority := func() error {
		a, e := authorize()
		if e != nil || a.ManifestSHA256 != j.ReleaseSHA || a.Domain != j.Domain || a.DisplayName != j.DisplayName {
			return ErrInstall
		}
		b, e := loadBundle(o.ReleaseDirectory, policy.Trust.Channel)
		if e != nil {
			return e
		}
		current, _, e := releaseprotocol.Verify(policy.Trust, b, trust, time.Now())
		if e != nil || current.SHA256() != j.ReleaseSHA || current.Manifest().ReleaseID != j.ReleaseID {
			return ErrInstall
		}
		return nil
	}
	if j.Next < 1 {
		for _, item := range []struct{ archive, bundle string }{{manifest.ImageArchiveTarget, manifest.ImageBundleTarget}, {manifest.MigrationArchiveTarget, manifest.MigrationBundleTarget}} {
			archive := filepath.Join(o.ReleaseDirectory, filepath.FromSlash(item.archive))
			proof := filepath.Join(o.ReleaseDirectory, filepath.FromSlash(item.bundle))
			file, e := os.Open(archive)
			if e != nil {
				return ErrInstall
			}
			info, e := file.Stat()
			if e != nil || !info.Mode().IsRegular() || !ownedByRoot(info) || info.Mode().Perm()&0022 != 0 || protectedDirectory(filepath.Dir(archive)) != nil {
				file.Close()
				return ErrInstall
			}
			hasher := sha256.New()
			e = trusted.VerifyTarget(item.archive, io.TeeReader(file, hasher))
			file.Close()
			if e != nil {
				return e
			}
			proofBytes, e := protectedRead(proof, 4<<20, false)
			if e != nil || trusted.VerifyTarget(item.bundle, bytes.NewReader(proofBytes)) != nil {
				return ErrInstall
			}
			// Standard pinned Cosign verification, not a fixture verifier or a hash-only shortcut.
			if bootstrap.VerifyReleaseArtifact(ctx, bootstrap.VerifyPolicy{VerifierPath: policy.VerifierPath, VerifierSHA256: policy.VerifierSHA256, CertificateIdentity: policy.Trust.SignerIdentity, OIDCIssuer: policy.Trust.SignerIssuer}, archive, proof, hex.EncodeToString(hasher.Sum(nil)), policy.Trust.MaxArtifactBytes, o.StateDirectory) != nil {
				return ErrInstall
			}
			if freshAuthority() != nil {
				return ErrInstall
			}
			if _, e = d.run(ctx, "load", "--input", archive); e != nil {
				return e
			}
		}
		j.App, e = loadedImage(ctx, d, manifest.ImageConfigSHA256, manifest.Image)
		if e != nil {
			return e
		}
		j.Migration, e = loadedImage(ctx, d, manifest.MigrationConfigSHA256, manifest.MigrationImage)
		if e != nil {
			return e
		}
		j.Next = 1
		if save() != nil {
			return ErrInstall
		}
	}
	if e = report("VERIFIED_RELEASE"); e != nil {
		return e
	}
	if j.Next < 2 {
		if freshAuthority() != nil {
			return ErrInstall
		}
		for _, image := range []string{postgresImage, proxyImage} {
			if _, e = d.run(ctx, "pull", image); e != nil {
				return e
			}
		}
		uidRaw, e := d.run(ctx, "run", "--rm", "--network", "none", "--entrypoint", "id", postgresImage, "-u", "postgres")
		uid, parse := strconv.Atoi(strings.TrimSpace(string(uidRaw)))
		if e != nil || parse != nil || uid < 1 || uid > 65535 {
			return ErrInstall
		}
		if render(o.State, stack, auth.Domain, j.DisplayName, j.App, j.Migration, uid) != nil {
			return ErrInstall
		}
		j.Next = 2
		if save() != nil {
			return ErrInstall
		}
	}
	compose := []string{"compose", "--project-directory", stack, "-f", filepath.Join(stack, "compose.yml"), "-f", filepath.Join(stack, "compose.p0-2-2-40.yml")}
	run := func(args ...string) error {
		if checkTemplates(stack) != nil {
			return ErrInstall
		}
		if freshAuthority() != nil {
			return ErrInstall
		}
		_, e := d.run(ctx, append(append([]string{}, compose...), args...)...)
		return e
	}
	steps := []func() error{
		func() error { return run("up", "-d", "--wait", "db") },
		func() error {
			if e := run("run", "--rm", "migrate"); e != nil {
				return e
			}
			return run("exec", "-T", "db", "sh", "/opt/jetseller/grant-runtime.sh")
		},
		func() error {
			_, e := d.run(ctx, "run", "--rm", "--network", "none", "--user", "0", "--entrypoint", "node", "--mount", "type=volume,source="+project+"_media,target=/media", j.App, "-e", mediaInit, auth.InstallationID)
			return e
		},
		func() error { return run("up", "-d", "--wait", "app") },
		func() error { return run("up", "-d", "caddy") },
		func() error { return run("exec", "-T", "app", "node", "-e", localReadiness) },
	}
	syncProgress := func() error {
		for _, item := range []struct {
			step  int
			phase string
		}{{3, "DATABASE"}, {5, "MIGRATION"}, {6, "APPLICATION"}, {8, "HTTPS_PENDING"}} {
			if j.Next >= item.step {
				if e := report(item.phase); e != nil {
					return e
				}
			}
		}
		return nil
	}
	if e = syncProgress(); e != nil {
		return e
	}
	for j.Next < 8 {
		idx := j.Next - 2
		if idx < 0 || idx >= len(steps) {
			return ErrInstall
		}
		if e = steps[idx](); e != nil {
			return e
		}
		j.Next++
		if save() != nil {
			return ErrInstall
		}
		if e = syncProgress(); e != nil {
			return e
		}
	}
	// A journal is not a health result. Probe even after a completed retry.
	if e = run("exec", "-T", "app", "node", "-e", localReadiness); e != nil {
		return e
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+auth.Domain+"/api/v1/ready", nil)
	res, e := probe.Do(req)
	if e != nil {
		return ErrHTTPSPending
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return ErrHTTPSPending
	}
	body, e := io.ReadAll(io.LimitReader(res.Body, 4097))
	var readiness struct {
		Success bool `json:"success"`
		Data    struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if e != nil || len(body) > 4096 || json.Unmarshal(body, &readiness) != nil || !readiness.Success || readiness.Data.Status != "ready" {
		return ErrHTTPSPending
	}
	if e = report("LOCAL_READINESS"); e != nil {
		return e
	}
	j.Next = 8
	return save()
}
func loadedImage(ctx context.Context, d docker, config, reference string) (string, error) {
	pins := []string{"sha256:" + config, reference[strings.LastIndex(reference, "@")+1:]}
	for _, pin := range pins {
		raw, e := d.run(ctx, "image", "inspect", "--format", "{{.Id}}", pin)
		id := strings.TrimSpace(string(raw))
		if e == nil && (id == pins[0] || id == pins[1]) {
			return id, nil
		}
	}
	return "", ErrInstall
}
func onlyOwnedContainers(ctx context.Context, d docker, project, app, migration string) error {
	raw, e := d.run(ctx, "ps", "--all", "--format", "{{json .}}")
	if e != nil {
		return ErrInstall
	}
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		if line == "" {
			continue
		}
		var item struct {
			ID string `json:"ID"`
		}
		if json.Unmarshal([]byte(line), &item) != nil || item.ID == "" {
			return ErrInstall
		}
		labels, e := d.run(ctx, "inspect", "--format", `{{index .Config.Labels "com.docker.compose.project"}}`, item.ID)
		if e != nil || strings.TrimSpace(string(labels)) != project {
			return ErrInstall
		}
		raw, e := d.run(ctx, "inspect", "--format", `{{index .Config.Labels "com.docker.compose.service"}} {{.Config.Image}}`, item.ID)
		if e != nil {
			return ErrInstall
		}
		parts := strings.Fields(string(raw))
		if len(parts) != 2 {
			return ErrInstall
		}
		expected := map[string]string{"db": postgresImage, "caddy": proxyImage, "app": app, "migrate": migration}
		if expected[parts[0]] == "" || parts[1] != expected[parts[0]] {
			return ErrInstall
		}

	}
	return nil
}

const mediaInit = `const fs=require('fs'),p='/media/.jetseller-installation-id',id=process.argv[1];if(fs.existsSync(p)){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||fs.readFileSync(p,'utf8')!==id+'\n')process.exit(1)}else{fs.writeFileSync(p,id+'\n',{mode:0o600,flag:'wx'})}fs.chownSync('/media',1000,1000);fs.chmodSync('/media',0o700);fs.chownSync(p,1000,1000);fs.chmodSync(p,0o600)`
const localReadiness = `fetch('http://127.0.0.1:3000/api/v1/ready',{signal:AbortSignal.timeout(5000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))`
