package bootstrap

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var fixturePath = regexp.MustCompile(`^/tmp/jetseller-runtime\.[A-Za-z0-9]+/stack$`)
var imageDigest = regexp.MustCompile(`^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$`)
var provisionFiles = []string{"compose.yml", ".env", "Caddyfile", "init-db.sh", "grant-runtime.sh", "private/bootstrap_password", "private/migration_password", "private/runtime_password", "private/runtime.json", "private/migration.json"}
var provisionSteps = []string{"DATABASE", "MIGRATION", "RUNTIME_GRANTS", "MEDIA", "APPLICATION", "PROXY", "READINESS"}

type provisionJournal struct {
	PlanSHA   string    `json:"plan_sha"`
	Next      int       `json:"next"`
	UpdatedAt time.Time `json:"updated_at"`
}
type dockerRunner interface {
	run(context.Context, ...string) ([]byte, error)
}
type localDocker struct{}

func (localDocker) run(ctx context.Context, args ...string) ([]byte, error) {
	bounded, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	command := exec.CommandContext(bounded, "/usr/bin/docker", append([]string{"--host", "unix:///var/run/docker.sock"}, args...)...)
	command.Env = []string{"PATH=/usr/bin:/bin", "HOME=/nonexistent", "DOCKER_CONFIG=/nonexistent", "LANG=C.UTF-8"}
	var output limitedOutput
	command.Stdout = &output
	command.Stderr = io.Discard
	if command.Run() != nil {
		return nil, ErrProvision
	}
	return output.Bytes(), nil
}

type limitedOutput struct{ bytes.Buffer }

func (b *limitedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 4<<20 {
		return 0, ErrProvision
	}
	return b.Buffer.Write(p)
}

// ApplyDisposableFixture is deliberately incapable of production installation:
// only a marked synthetic /tmp fixture is accepted. It does not provision host
// packages, change DNS, fetch unsigned scripts or expose arbitrary remote exec.
func ValidateDisposableFixturePaths(stateDirectory, stack string) error {
	if runtime.GOOS != "linux" || os.Geteuid() != 0 || !fixturePath.MatchString(stack) || filepath.Clean(stack) != stack || safeAncestors(stack) != nil || stateDirectory != filepath.Join(filepath.Dir(stack), "state") {
		return ErrProvision
	}
	return nil
}

func ApplyDisposableFixture(ctx context.Context, state *State, stack, metadataDirectory, rootPin string) error {
	return applyDisposableFixture(ctx, state, stack, metadataDirectory, rootPin, localDocker{})
}
func applyDisposableFixture(ctx context.Context, state *State, stack, metadataDirectory, rootPin string, runner dockerRunner) error {
	if state == nil || state.root == nil || ValidateDisposableFixturePaths(state.root.Name(), stack) != nil {
		return ErrProvision
	}
	marker, err := readBoundedRegular(filepath.Join(stack, ".jetseller-disposable"), 4096)
	if err != nil {
		return ErrProvision
	}
	var identity struct {
		Version      int    `json:"version"`
		Installation string `json:"installation"`
		Production   bool   `json:"production"`
	}
	if json.Unmarshal(marker, &identity) != nil || identity.Version != 1 || identity.Production || identity.Installation != state.Identity.InstallationID {
		return ErrProvision
	}
	var previous fixtureTrust
	if raw, err := state.readPrivate("fixture-trust.json", 4096); err == nil {
		if json.Unmarshal(raw, &previous) != nil {
			return ErrProvision
		}
	} else if !os.IsNotExist(err) {
		return ErrProvision
	}
	plan, trust, err := verifyFixtureTUF(metadataDirectory, rootPin, previous, time.Now())
	if err != nil || plan.Version != 1 || plan.InstallationID != identity.Installation || plan.Platform != "linux/amd64" || len(plan.Files) != len(provisionFiles) {
		return ErrProvision
	}
	for _, image := range []string{plan.AppImage, plan.MigrationImage, plan.DatabaseImage, plan.ProxyImage} {
		if !imageDigest.MatchString(image) {
			return ErrProvision
		}
	}
	// Stage verified inputs under the root-private state directory. Docker never
	// reads mutable caller-provided Compose files after their authorization check.
	staged := filepath.Join(state.root.Name(), "fixture-"+trust.PlanSHA)
	if os.MkdirAll(filepath.Join(staged, "private"), 0700) != nil {
		return ErrProvision
	}
	for _, name := range provisionFiles {
		expected, ok := plan.Files[name]
		if !ok || !shaPattern.MatchString(expected) || safeAncestors(filepath.Dir(filepath.Join(stack, name))) != nil {
			return ErrProvision
		}
		raw, err := readBoundedRegular(filepath.Join(stack, name), 128<<10)
		if err != nil || digestBytes(raw) != expected {
			return ErrProvision
		}
		destination := filepath.Join(staged, name)
		if existing, err := readBoundedRegular(destination, 128<<10); err == nil {
			if digestBytes(existing) != expected {
				return ErrProvision
			}
		} else if os.IsNotExist(err) {
			f, e := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if e != nil {
				return ErrProvision
			}
			_, e = f.Write(raw)
			if e == nil {
				e = f.Sync()
			}
			f.Close()
			if e != nil {
				return ErrProvision
			}
		} else {
			return ErrProvision
		}
	}
	project := "jsfixture_" + identity.Installation[:8]
	compose := []string{"compose", "--project-directory", staged, "--env-file", filepath.Join(staged, ".env"), "-f", filepath.Join(staged, "compose.yml")}
	rendered, err := runner.run(ctx, append(append([]string{}, compose...), "--profile", "tools", "config", "--format", "json")...)
	if err != nil {
		return fmt.Errorf("compose normalization: %w", ErrProvision)
	}
	if err := validateFixtureCompose(rendered, staged, project, plan); err != nil {
		return fmt.Errorf("compose policy: %w", err)
	}
	// Resolve the UID from the exact digest-authorized database image. No shared
	// secret is placed in argv/env; file-backed mounts retain restrictive modes.
	uidRaw, err := runner.run(ctx, "run", "--rm", "--entrypoint", "id", plan.DatabaseImage, "-u", "postgres")
	uid, e := strconv.Atoi(strings.TrimSpace(string(uidRaw)))
	if err != nil || e != nil || uid < 1 || uid > 65535 {
		return ErrProvision
	}
	for _, name := range provisionFiles {
		if strings.HasPrefix(name, "private/") || name == "init-db.sh" || name == "grant-runtime.sh" {
			owner := uid
			if strings.HasSuffix(name, ".json") {
				owner = 1000
			}
			if os.Chown(filepath.Join(staged, name), owner, owner) != nil {
				return ErrProvision
			}
		}
	}
	var journal provisionJournal
	if raw, err := state.readPrivate("fixture-provision.json", 4096); err == nil {
		if json.Unmarshal(raw, &journal) != nil || journal.PlanSHA != trust.PlanSHA || journal.Next < 0 || journal.Next > len(provisionSteps) {
			return ErrProvision
		}
	} else if !os.IsNotExist(err) {
		return ErrProvision
	} else {
		journal.PlanSHA = trust.PlanSHA
	}
	if state.writePrivate("fixture-trust.json", trust) != nil {
		return ErrProvision
	}
	for journal.Next < len(provisionSteps) {
		var args []string
		switch provisionSteps[journal.Next] {
		case "DATABASE":
			args = append(append([]string{}, compose...), "up", "-d", "--wait", "db")
		case "MIGRATION":
			args = append(append([]string{}, compose...), "run", "--rm", "migrate")
		case "RUNTIME_GRANTS":
			args = append(append([]string{}, compose...), "exec", "-T", "db", "sh", "/opt/jetseller/grant-runtime.sh")
		case "MEDIA":
			args = []string{"run", "--rm", "--user", "0", "--entrypoint", "node", "--mount", "type=volume,source=" + project + "_media,target=/media", plan.AppImage, "-e", fixtureMediaProgram, identity.Installation}
		case "APPLICATION":
			args = append(append([]string{}, compose...), "up", "-d", "--wait", "app")
		case "PROXY":
			args = append(append([]string{}, compose...), "up", "-d", "caddy")
		case "READINESS":
			args = append(append([]string{}, compose...), "exec", "-T", "app", "node", "-e", fixtureReadinessProgram)
		default:
			return ErrProvision
		}
		if _, err := runner.run(ctx, args...); err != nil {
			return ErrProvision
		}
		journal.Next++
		journal.UpdatedAt = time.Now().UTC()
		if state.writePrivate("fixture-provision.json", journal) != nil {
			return ErrProvision
		}
	}
	// A completed journal is not proof a stopped or damaged service is healthy.
	_, err = runner.run(ctx, append(append([]string{}, compose...), "exec", "-T", "app", "node", "-e", fixtureReadinessProgram)...)
	if err != nil {
		return ErrProvision
	}
	return nil
}

const fixtureMediaProgram = `const fs=require('fs'),p='/media/.jetseller-installation-id',id=process.argv[1];if(fs.existsSync(p)){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||fs.readFileSync(p,'utf8')!==id+'\n')process.exit(1)}else{fs.writeFileSync(p,id+'\n',{mode:0o600,flag:'wx'})}fs.chownSync('/media',1000,1000);fs.chmodSync('/media',0o700);fs.chownSync(p,1000,1000);fs.chmodSync(p,0o600)`
const fixtureReadinessProgram = `fetch('http://127.0.0.1:3000/api/v1/ready',{signal:AbortSignal.timeout(5000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))`

func safeAncestors(directory string) error {
	for current := directory; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return ErrProvision
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}

func validateFixtureCompose(raw []byte, staged, project string, plan FixturePlan) error {
	var config struct {
		Name     string                                `json:"name"`
		Services map[string]map[string]json.RawMessage `json:"services"`
		Volumes  map[string]map[string]any             `json:"volumes"`
		Networks map[string]map[string]any             `json:"networks"`
		Secrets  map[string]struct {
			File string `json:"file"`
		} `json:"secrets"`
	}
	if json.Unmarshal(raw, &config) != nil || config.Name != project || len(config.Services) != 4 || len(config.Volumes) != 4 || len(config.Networks) != 3 || len(config.Secrets) != 5 {
		return fmt.Errorf("policy check 1: %w", ErrProvision)
	}
	allowed := strings.Fields("cap_drop cpus depends_on environment healthcheck image logging mem_limit networks pids_limit platform ports profiles read_only restart secrets security_opt tmpfs user volumes")
	fields := map[string]bool{}
	for _, key := range allowed {
		fields[key] = true
	}
	images := map[string]string{"app": plan.AppImage, "migrate": plan.MigrationImage, "db": plan.DatabaseImage, "caddy": plan.ProxyImage}
	mounts := map[string]map[string]string{"db": {"/var/lib/postgresql/data": "db_data", "/docker-entrypoint-initdb.d/10-jetseller.sh": filepath.Join(staged, "init-db.sh"), "/opt/jetseller/grant-runtime.sh": filepath.Join(staged, "grant-runtime.sh")}, "app": {"/var/lib/jetseller/media": "media"}, "caddy": {"/etc/caddy/Caddyfile": filepath.Join(staged, "Caddyfile"), "/data": "caddy_data", "/config": "caddy_config"}, "migrate": {}}
	for name, image := range images {
		service, ok := config.Services[name]
		if !ok {
			return fmt.Errorf("policy check 2: %w", ErrProvision)
		}
		for key := range service {
			if !fields[key] {
				return fmt.Errorf("unsupported service field %q: %w", key, ErrProvision)
			}
		}
		var actual string
		if json.Unmarshal(service["image"], &actual) != nil || actual != image {
			return fmt.Errorf("policy check 4: %w", ErrProvision)
		}
		if name == "app" || name == "migrate" {
			var user string
			var readOnly bool
			if json.Unmarshal(service["user"], &user) != nil || user != "1000:1000" || json.Unmarshal(service["read_only"], &readOnly) != nil || !readOnly {
				return fmt.Errorf("policy check 5: %w", ErrProvision)
			}
		}
		expectedNetworks := map[string][]string{"db": {"database"}, "migrate": {"database"}, "app": {"database", "edge", "outbound"}, "caddy": {"edge", "outbound"}}
		var networks map[string]json.RawMessage
		if json.Unmarshal(service["networks"], &networks) != nil || len(networks) != len(expectedNetworks[name]) {
			return fmt.Errorf("policy check 6: %w", ErrProvision)
		}
		for _, network := range expectedNetworks[name] {
			if _, ok := networks[network]; !ok {
				return fmt.Errorf("policy check 7: %w", ErrProvision)
			}
		}
		if name == "app" || name == "migrate" {
			var caps, security []string
			if json.Unmarshal(service["cap_drop"], &caps) != nil || len(caps) != 1 || caps[0] != "ALL" || json.Unmarshal(service["security_opt"], &security) != nil || len(security) != 1 || (security[0] != "no-new-privileges:true" && security[0] != "no-new-privileges") {
				return fmt.Errorf("policy check 8: %w", ErrProvision)
			}
		}
		// Do not attach migration secrets to an ordinary application container.
		expectedSecrets := map[string][]string{"db": {"bootstrap_password", "migration_password", "runtime_password"}, "app": {"runtime_config"}, "migrate": {"migration_config"}, "caddy": {}}
		var grants []map[string]any
		if data, ok := service["secrets"]; ok {
			if json.Unmarshal(data, &grants) != nil {
				return fmt.Errorf("policy check 9: %w", ErrProvision)
			}
		}
		if len(grants) != len(expectedSecrets[name]) {
			return fmt.Errorf("policy check 10: %w", ErrProvision)
		}
		seenSecrets := map[string]bool{}
		for _, grant := range grants {
			source, ok := grant["source"].(string)
			if !ok || seenSecrets[source] {
				return fmt.Errorf("policy check 11: %w", ErrProvision)
			}
			seenSecrets[source] = true
			permitted := false
			for _, expected := range expectedSecrets[name] {
				if source == expected {
					permitted = true
				}
			}
			if !permitted {
				return fmt.Errorf("policy check 12: %w", ErrProvision)
			}
			for key, value := range grant {
				switch key {
				case "source":
				case "target":
					if value != source && value != "/run/secrets/"+source {
						return fmt.Errorf("policy check 13: %w", ErrProvision)
					}
				case "mode":
					if value != float64(0o444) && value != float64(0o600) {
						return fmt.Errorf("policy check 14: %w", ErrProvision)
					}
				default:
					return fmt.Errorf("policy check 15: %w", ErrProvision)
				}
			}
		}
		var ports []struct {
			Target    int    `json:"target"`
			Published string `json:"published"`
			HostIP    string `json:"host_ip"`
			Protocol  string `json:"protocol"`
		}
		if data, ok := service["ports"]; ok {
			if json.Unmarshal(data, &ports) != nil {
				return fmt.Errorf("policy check 16: %w", ErrProvision)
			}
		}
		if name != "caddy" && len(ports) != 0 {
			return fmt.Errorf("policy check 17: %w", ErrProvision)
		}
		if name == "caddy" {
			if len(ports) != 2 {
				return fmt.Errorf("policy check 18: %w", ErrProvision)
			}
			seen := map[int]bool{}
			for _, p := range ports {
				if (p.Target != 80 && p.Target != 443) || p.Published != strconv.Itoa(p.Target) || (p.HostIP != "" && p.HostIP != "0.0.0.0") || p.Protocol != "tcp" || seen[p.Target] {
					return fmt.Errorf("policy check 19: %w", ErrProvision)
				}
				seen[p.Target] = true
			}
		}
		var volumes []struct {
			Type     string `json:"type"`
			Source   string `json:"source"`
			Target   string `json:"target"`
			ReadOnly bool   `json:"read_only"`
		}
		if data, ok := service["volumes"]; ok {
			if json.Unmarshal(data, &volumes) != nil {
				return fmt.Errorf("policy check 20: %w", ErrProvision)
			}
		}
		if len(volumes) != len(mounts[name]) {
			return fmt.Errorf("policy check 21: %w", ErrProvision)
		}
		seen := map[string]bool{}
		for _, v := range volumes {
			expected, ok := mounts[name][v.Target]
			if !ok || seen[v.Target] || v.Source != expected {
				return fmt.Errorf("policy check 22: %w", ErrProvision)
			}
			seen[v.Target] = true
			if filepath.IsAbs(expected) {
				if v.Type != "bind" || !v.ReadOnly {
					return fmt.Errorf("policy check 23: %w", ErrProvision)
				}
			} else if v.Type != "volume" {
				return fmt.Errorf("policy check 24: %w", ErrProvision)
			}
		}
	}
	for _, name := range []string{"db_data", "media", "caddy_data", "caddy_config"} {
		v, ok := config.Volumes[name]
		if !ok || len(v) != 1 || v["name"] != project+"_"+name {
			return fmt.Errorf("policy check 25: %w", ErrProvision)
		}
	}
	for _, name := range []string{"database", "edge", "outbound"} {
		n, ok := config.Networks[name]
		if !ok || n["name"] != project+"_"+name {
			return fmt.Errorf("policy check 26: %w", ErrProvision)
		}
		for key := range n {
			if key != "name" && key != "internal" {
				return fmt.Errorf("policy check 27: %w", ErrProvision)
			}
		}
		if name != "outbound" && n["internal"] != true {
			return fmt.Errorf("policy check 28: %w", ErrProvision)
		}
	}
	for _, name := range []string{"bootstrap_password", "migration_password", "runtime_password", "runtime_config", "migration_config"} {
		filename := name
		if strings.HasSuffix(name, "_config") {
			filename = strings.TrimSuffix(name, "_config") + ".json"
		}
		if secret, ok := config.Secrets[name]; !ok || secret.File != filepath.Join(staged, "private", filename) {
			return fmt.Errorf("policy check 29: %w", ErrProvision)
		}
	}
	return nil
}

func FixturePlanResult(state *State) string {
	return fmt.Sprintf("Disposable fixture %s passed local readiness; public HTTPS, reboot and production delivery remain gated.", state.Identity.InstallationID)
}
