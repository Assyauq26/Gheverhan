package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

// This opt-in integration test verifies a real upstream Sigstore bundle. No
// generated mock verifier can count as signature verification evidence.
func TestRealCosignSignedArtifactAndTamper(t *testing.T) {
	dir := os.Getenv("JETSELLER_COSIGN_FIXTURE")
	if dir == "" {
		t.Skip("real Cosign fixture not provisioned")
	}
	verifier := filepath.Join(dir, os.Getenv("JETSELLER_COSIGN_FILENAME"))
	policy := VerifyPolicy{verifier, os.Getenv("JETSELLER_COSIGN_SHA256"), "keyless@projectsigstore.iam.gserviceaccount.com", "https://accounts.google.com"}
	artifact := filepath.Join(dir, "cosign_checksums.txt")
	bundle := artifact + ".sigstore.json"
	raw, e := os.ReadFile(artifact)
	if e != nil {
		t.Fatal(e)
	}
	digest := sha256.Sum256(raw)
	if VerifyArtifact(context.Background(), policy, artifact, bundle, hex.EncodeToString(digest[:])) != nil {
		t.Fatal("real signed artifact verification failed")
	}
	tampered := filepath.Join(t.TempDir(), "tampered")
	raw = append(raw, []byte("tampered")...)
	os.WriteFile(tampered, raw, 0600)
	newDigest := sha256.Sum256(raw)
	if VerifyArtifact(context.Background(), policy, tampered, bundle, hex.EncodeToString(newDigest[:])) == nil {
		t.Fatal("signature accepted tampered bytes with matching hash")
	}
	wrong := policy
	wrong.CertificateIdentity = "https://github.com/attacker/repo/.github/workflows/release.yml@refs/tags/v3.1.4"
	if VerifyArtifact(context.Background(), wrong, artifact, bundle, hex.EncodeToString(digest[:])) == nil {
		t.Fatal("unauthorized signer accepted")
	}
}
