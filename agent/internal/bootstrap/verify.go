package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"
)

var ErrVerification = errors.New("artifact verification failed; nothing executed")
var shaPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type VerifyPolicy struct {
	VerifierPath        string
	VerifierSHA256      string
	CertificateIdentity string
	OIDCIssuer          string
}

// VerifyArtifact stages immutable private snapshots and invokes only a pinned
// standard verifier. It never executes the artifact. Freshness/TUF and initial
// verifier trust remain separate release gates, not simulated checks.
func VerifyArtifact(ctx context.Context, policy VerifyPolicy, artifact, bundle, expectedSHA string) error {
	if !filepath.IsAbs(policy.VerifierPath) || !shaPattern.MatchString(policy.VerifierSHA256) || !shaPattern.MatchString(expectedSHA) || policy.CertificateIdentity == "" || policy.OIDCIssuer == "" {
		return ErrVerification
	}
	dir, err := os.MkdirTemp("", "jetseller-verify-")
	if err != nil {
		return ErrVerification
	}
	defer os.RemoveAll(dir)
	verifier := filepath.Join(dir, "cosign")
	if filepath.Ext(policy.VerifierPath) == ".exe" {
		verifier += ".exe"
	}
	if copyVerified(policy.VerifierPath, verifier, policy.VerifierSHA256, 256<<20, 0700) != nil {
		return ErrVerification
	}
	target := filepath.Join(dir, "artifact")
	if copyVerified(artifact, target, expectedSHA, 256<<20, 0600) != nil {
		return ErrVerification
	}
	proof := filepath.Join(dir, "bundle.json")
	if copyBounded(bundle, proof, 4<<20, 0600) != nil {
		return ErrVerification
	}
	bounded, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	command := exec.CommandContext(bounded, verifier, "verify-blob", "--offline", "--bundle", proof, "--certificate-identity", policy.CertificateIdentity, "--certificate-oidc-issuer", policy.OIDCIssuer, target)
	command.Env = []string{"HOME=" + dir, "XDG_CACHE_HOME=" + dir, "SYSTEMROOT=" + os.Getenv("SYSTEMROOT"), "USERPROFILE=" + dir, "LOCALAPPDATA=" + dir, "APPDATA=" + dir, "TEMP=" + dir, "TMP=" + dir}
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	if command.Run() != nil {
		return ErrVerification
	}
	return nil
}
func copyBounded(source, target string, max int64, mode os.FileMode) error {
	info, err := os.Lstat(source)
	if err != nil || !info.Mode().IsRegular() || info.Size() > max {
		return ErrVerification
	}
	f, err := os.Open(source)
	if err != nil {
		return ErrVerification
	}
	defer f.Close()
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return ErrVerification
	}
	defer out.Close()
	n, err := io.Copy(out, io.LimitReader(f, max+1))
	if err != nil || n > max {
		return ErrVerification
	}
	return out.Sync()
}
func copyVerified(source, target, digest string, max int64, mode os.FileMode) error {
	if err := copyBounded(source, target, max, mode); err != nil {
		return err
	}
	f, err := os.Open(target)
	if err != nil {
		return ErrVerification
	}
	defer f.Close()
	hash := sha256.New()
	if _, err = io.Copy(hash, f); err != nil {
		return ErrVerification
	}
	if hex.EncodeToString(hash.Sum(nil)) != digest {
		return ErrVerification
	}
	return nil
}
