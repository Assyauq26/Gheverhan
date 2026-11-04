package installer

import (
	"context"
	"encoding/json"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"path/filepath"
	"strings"
	"time"
)

// ActivateAdmin is a local-root operation, independent of the portal's uptime.
// It issues a one-use claim only when no local administrator already exists.
// The claim is captured privately and never sent to the central control plane.
func ActivateAdmin(ctx context.Context, s *bootstrap.State, directory, confirmation string) error {
	if bootstrap.ValidateInstallState(s) != nil || confirmation != s.Identity.InstallationID {
		return ErrInstall
	}
	var j journal
	if s.ReadInstallRecord(bootstrap.InstallJournalRecord, &j) != nil || j.Version != 1 || j.Next != 8 || j.Reported != len(phases) || j.InstallationID != s.Identity.InstallationID {
		return ErrInstall
	}
	project := "jsstore_" + strings.ReplaceAll(j.InstallationID, "-", "")
	stack := filepath.Join(directory, "store")
	if protectedDirectory(stack) != nil || checkTemplates(stack) != nil {
		return ErrInstall
	}
	id, e := bootstrap.NewUUID()
	if e != nil {
		return ErrInstall
	}
	temp := "/tmp/local-admin-" + id
	d := localDocker{}
	compose := []string{"compose", "--project-directory", stack, "-f", filepath.Join(stack, "compose.yml"), "-f", filepath.Join(stack, "compose.p0-2-2-40.yml"), "exec", "-T", "app", "node"}
	_ = project
	run := func(args ...string) ([]byte, error) {
		return d.run(ctx, append(append([]string{}, compose...), args...)...)
	}
	if _, e = run("-e", `require('fs').mkdirSync(process.argv[1],{mode:0o700})`, temp); e != nil {
		return e
	}
	if _, e = run("self-hosted/issue-admin.mjs", "--config", "/run/secrets/runtime_config", "--out", temp+"/claim.json"); e != nil {
		return e
	}
	raw, e := run("-e", `const fs=require('fs'),p=process.argv[1],s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)process.exit(1);process.stdout.write(fs.readFileSync(p))`, temp+"/claim.json")
	if e != nil || len(raw) > 4096 {
		return ErrInstall
	}
	var claim struct {
		Claim          string    `json:"claim"`
		ExpiresAt      time.Time `json:"expiresAt"`
		InstallationID string    `json:"installationId"`
	}
	if json.Unmarshal(raw, &claim) != nil || claim.InstallationID != j.InstallationID || len(claim.Claim) != 43 || !claim.ExpiresAt.After(time.Now()) {
		return ErrInstall
	}
	if s.WriteInstallRecord(bootstrap.AdminClaimRecord, claim) != nil {
		return ErrInstall
	}
	_, _ = run("-e", `const fs=require('fs');fs.unlinkSync(process.argv[1]+'/claim.json');fs.rmdirSync(process.argv[1])`, temp)
	return nil
}
