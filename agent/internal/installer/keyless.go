package installer

import (
	"context"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
	"os"
	"path/filepath"
	"time"
)

func verifyMetadata(ctx context.Context, p Policy, b releaseprotocol.Bundle, previous releaseprotocol.State, parent string) (releaseprotocol.TrustedRelease, releaseprotocol.State, error) {
	if p.Version != 2 || p.Trust.Mode != releaseprotocol.KeylessMode {
		return releaseprotocol.Verify(p.Trust, b, previous, time.Now())
	}
	return releaseprotocol.VerifyKeyless(p.Trust, b, previous, time.Now(), func(raw, sig []byte) error {
		if protectedDirectory(parent) != nil {
			return ErrInstall
		}
		dir, err := os.MkdirTemp(parent, "keyless-metadata-")
		if err != nil {
			return ErrInstall
		}
		defer os.RemoveAll(dir)
		metadata, bundle := filepath.Join(dir, "release.json"), filepath.Join(dir, "release.sigstore.json")
		if stableFile(metadata, raw, 0600) != nil || stableFile(bundle, sig, 0600) != nil {
			return ErrInstall
		}
		return bootstrap.VerifyReleaseArtifact(ctx, bootstrap.VerifyPolicy{VerifierPath: p.VerifierPath, VerifierSHA256: p.VerifierSHA256,
			CertificateIdentity: p.Trust.SignerIdentity, OIDCIssuer: p.Trust.SignerIssuer}, metadata, bundle, digest(raw), 64<<10, dir)
	})
}
