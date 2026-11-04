package installer

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
)

// FetchRelease accepts a bounded, short-lived HTTPS artifact location only from
// the paired control plane and independently pinned local origin. ZIP contents
// are confined data files; nothing downloaded is executed or extracted as a
// host path. TUF and pinned Cosign verification must succeed before publication.
func FetchRelease(ctx context.Context, o Options) error {
	if bootstrap.ValidateInstallState(o.State) != nil || o.Confirmation != o.State.Identity.InstallationID {
		return ErrInstall
	}
	p, e := loadPolicy(o.PolicyFile)
	if e != nil {
		return e
	}
	base, e := url.Parse(p.ArtifactOrigin)
	if e != nil || base.Scheme != "https" || base.Host == "" || base.User != nil || base.Path != "" || base.RawQuery != "" || base.Fragment != "" {
		return ErrInstall
	}
	client, e := bootstrap.NewPairingClient(o.ControlOrigin)
	if e != nil {
		return e
	}
	var auth Authorization
	if client.InstallRequest(ctx, o.State, "GET", "/agent/release-download-authorization", nil, &auth) != nil || auth.InstallationID != o.State.Identity.InstallationID || !auth.ExpiresAt.After(time.Now()) {
		return ErrInstall
	}
	credential, e := o.State.PairedCredential()
	if e != nil || auth.DeviceID != credential.DeviceID || !validDomain(auth.Domain) || auth.ExpiresAt.After(time.Now().Add(125*time.Second)) {
		return ErrInstall
	}
	u, e := url.Parse(auth.BundleURL)
	if e != nil || u.Scheme != "https" || u.Host != base.Host || u.User != nil || u.Fragment != "" || len(auth.BundleSHA256) != 64 {
		return ErrInstall
	}
	if !filepath.IsAbs(o.ReleaseDirectory) || protectedDirectory(filepath.Dir(o.ReleaseDirectory)) != nil {
		return ErrInstall
	}
	if _, e = os.Lstat(o.ReleaseDirectory); e == nil {
		return verifyFetched(ctx, o, o.ReleaseDirectory, auth)
	} else if !os.IsNotExist(e) {
		return ErrInstall
	}
	if _, e = bootstrap.InspectP0Host(o.StateDirectory, p.Budget); e != nil {
		return ErrInstall
	}
	temp, e := os.MkdirTemp(o.StateDirectory, "release-download-")
	if e != nil {
		return ErrInstall
	}
	defer os.RemoveAll(temp)
	req, e := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if e != nil {
		return ErrInstall
	}
	httpClient := &http.Client{Timeout: 20 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, e := httpClient.Do(req)
	if e != nil {
		return ErrInstall
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return ErrInstall
	}
	archive := filepath.Join(temp, "bundle.zip")
	out, e := os.OpenFile(archive, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return ErrInstall
	}
	h := sha256.New()
	n, e := io.Copy(io.MultiWriter(out, h), io.LimitReader(res.Body, int64(p.Budget.DownloadBytes)+1))
	syncErr := out.Sync()
	out.Close()
	if e != nil || syncErr != nil || n <= 0 || uint64(n) > p.Budget.DownloadBytes || hex.EncodeToString(h.Sum(nil)) != auth.BundleSHA256 {
		return ErrInstall
	}
	stage := filepath.Join(temp, "verified")
	if directory(stage) != nil {
		return ErrInstall
	}
	if extractPackage(archive, stage, p.Trust.Channel, p.Budget.DownloadBytes-uint64(n)) != nil {
		return ErrInstall
	}
	if os.Remove(archive) != nil {
		return ErrInstall
	}
	if verifyFetched(ctx, o, stage, auth) != nil {
		return ErrInstall
	}
	// Recheck current approval after a slow download, preserving UUID/key binding.
	var current Authorization
	if client.InstallRequest(ctx, o.State, "GET", "/agent/install-authorization", nil, &current) != nil || current.InstallationID != auth.InstallationID || current.DeviceID != auth.DeviceID || current.ManifestSHA256 != auth.ManifestSHA256 || current.BundleSHA256 != auth.BundleSHA256 || !current.ExpiresAt.After(time.Now()) {
		return ErrInstall
	}
	if os.Rename(stage, o.ReleaseDirectory) != nil {
		return ErrInstall
	}
	parent, e := os.Open(filepath.Dir(o.ReleaseDirectory))
	if e != nil {
		return ErrInstall
	}
	defer parent.Close()
	return parent.Sync()
}
func verifyFetched(ctx context.Context, o Options, dir string, auth Authorization) error {
	receiptDir, e := os.MkdirTemp(o.StateDirectory, "release-receipt-")
	if e != nil {
		return ErrInstall
	}
	defer os.RemoveAll(receiptDir)
	file := filepath.Join(receiptDir, "receipt.json")
	if VerifyPackage(ctx, o.PolicyFile, dir, file) != nil {
		return ErrInstall
	}
	raw, e := protectedRead(file, 4096, true)
	var receipt VerificationReceipt
	if e != nil || json.Unmarshal(raw, &receipt) != nil || receipt.ReleaseID != auth.ReleaseID || receipt.ManifestSHA256 != auth.ManifestSHA256 {
		return ErrInstall
	}
	return nil
}
func extractPackage(archive, stage, channel string, max uint64) error {
	reader, e := zip.OpenReader(archive)
	if e != nil {
		return ErrInstall
	}
	defer reader.Close()
	if len(reader.File) > 128 {
		return ErrInstall
	}
	seen := map[string]bool{}
	var total uint64
	rootUpdate := regexp.MustCompile(`^[1-9][0-9]{0,3}\.root\.json$`)
	artifact := regexp.MustCompile(`^artifacts/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$`)
	for _, entry := range reader.File {
		name := entry.Name
		if name != filepath.ToSlash(filepath.Clean(name)) || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") || seen[name] {
			return ErrInstall
		}
		seen[name] = true
		allowed := name == "root.json" || name == "timestamp.json" || name == "snapshot.json" || name == "targets.json" || name == "channels/"+channel+"/release.json" || rootUpdate.MatchString(name) || artifact.MatchString(name)
		if !allowed || !entry.Mode().IsRegular() || entry.UncompressedSize64 > max-total {
			return ErrInstall
		}
		total += entry.UncompressedSize64
		target := filepath.Join(stage, filepath.FromSlash(name))
		if os.MkdirAll(filepath.Dir(target), 0700) != nil {
			return ErrInstall
		}
		input, e := entry.Open()
		if e != nil {
			return ErrInstall
		}
		output, e := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			input.Close()
			return ErrInstall
		}
		n, e := io.Copy(output, io.LimitReader(input, int64(entry.UncompressedSize64)+1))
		se := output.Sync()
		ce := output.Close()
		input.Close()
		if e != nil || se != nil || ce != nil || uint64(n) != entry.UncompressedSize64 {
			return ErrInstall
		}
	}
	return nil
}
