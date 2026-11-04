package installer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
	"io"
	"os"
	"path/filepath"
	"time"
)

type VerificationReceipt struct {
	Status         string    `json:"status"`
	ReleaseID      string    `json:"release_id"`
	ManifestSHA256 string    `json:"manifest_sha256"`
	RootSHA256     string    `json:"root_sha256"`
	ExpiresAt      time.Time `json:"expires_at"`
}

// VerifyPackage does not install or fetch anything. Its protected output is a
// publication receipt for the separately approved catalog, not a production
// root-custody approval or a proof of an installed store.
func VerifyPackage(ctx context.Context, policyFile, releaseDirectory, receiptFile string) error {
	p, e := loadPolicy(policyFile)
	if e != nil || !filepath.IsAbs(receiptFile) || protectedDirectory(filepath.Dir(receiptFile)) != nil {
		return ErrInstall
	}
	b, e := loadBundle(releaseDirectory, p.Trust.Channel)
	if e != nil {
		return e
	}
	r, _, e := releaseprotocol.Verify(p.Trust, b, releaseprotocol.State{}, time.Now())
	if e != nil {
		return e
	}
	m := r.Manifest()
	var total, largest uint64
	for _, name := range []string{m.ImageArchiveTarget, m.MigrationArchiveTarget} {
		n, e := r.TargetSize(name)
		if e != nil || n < 1 {
			return ErrInstall
		}
		total += uint64(n)
		if uint64(n) > largest {
			largest = uint64(n)
		}
	}
	st, e := os.Stat(p.VerifierPath)
	if e != nil || st.Size() < 1 || total+largest+uint64(st.Size())+(32<<20) > p.Budget.DownloadBytes {
		return ErrInstall
	}
	for _, item := range []struct{ archive, bundle string }{{m.ImageArchiveTarget, m.ImageBundleTarget}, {m.MigrationArchiveTarget, m.MigrationBundleTarget}} {
		file := filepath.Join(releaseDirectory, filepath.FromSlash(item.archive))
		proof := filepath.Join(releaseDirectory, filepath.FromSlash(item.bundle))
		if protectedDirectory(filepath.Dir(file)) != nil {
			return ErrInstall
		}
		info, e := os.Lstat(file)
		if e != nil || !info.Mode().IsRegular() || !ownedByRoot(info) || info.Mode().Perm()&0022 != 0 {
			return ErrInstall
		}
		f, e := os.Open(file)
		if e != nil {
			return e
		}
		h := sha256.New()
		e = r.VerifyTarget(item.archive, io.TeeReader(f, h))
		f.Close()
		if e != nil {
			return e
		}
		proofRaw, e := protectedRead(proof, 4<<20, false)
		if e != nil || r.VerifyTarget(item.bundle, bytes.NewReader(proofRaw)) != nil {
			return ErrInstall
		}
		if bootstrap.VerifyReleaseArtifact(ctx, bootstrap.VerifyPolicy{VerifierPath: p.VerifierPath, VerifierSHA256: p.VerifierSHA256, CertificateIdentity: p.Trust.SignerIdentity, OIDCIssuer: p.Trust.SignerIssuer}, file, proof, hex.EncodeToString(h.Sum(nil)), p.Trust.MaxArtifactBytes, filepath.Dir(receiptFile)) != nil {
			return ErrInstall
		}
	}
	receipt := VerificationReceipt{Status: "VERIFIED", ReleaseID: m.ReleaseID, ManifestSHA256: r.SHA256(), RootSHA256: p.Trust.BootstrapRootSHA256, ExpiresAt: m.ExpiresAt}
	raw, e := json.Marshal(receipt)
	if e != nil {
		return ErrInstall
	}
	return stableFile(receiptFile, append(raw, '\n'), 0600)
}
