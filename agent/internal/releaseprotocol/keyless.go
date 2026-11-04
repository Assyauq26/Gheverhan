package releaseprotocol

import (
	"encoding/hex"
	"encoding/json"
	"regexp"
	"time"

	"github.com/theupdateframework/go-tuf/v2/metadata"
)

const KeylessMode = "keyless-v2"
const KeylessSchema = "btos-keyless-release/v2"

var sourceSHA = regexp.MustCompile(`^[a-f0-9]{40}$`)

type ArtifactPin struct {
	Length int64  `json:"length"`
	SHA256 string `json:"sha256"`
}

// The exact bytes of this envelope are signed by the protected CI workflow.
// The locally provisioned policy supplies the authority; metadata cannot choose it.
type KeylessMetadata struct {
	SchemaVersion string                 `json:"schema_version"`
	SourceSHA     string                 `json:"source_sha"`
	Manifest      Manifest               `json:"manifest"`
	Artifacts     map[string]ArtifactPin `json:"artifacts"`
}

func validKeylessPolicy(p Policy) bool {
	return p.Mode == KeylessMode && p.BootstrapRootSHA256 == "" && p.MinimumRootThreshold == 0 &&
		sourceSHA.MatchString(p.ExpectedSourceSHA) && p.MinimumReleaseSequence > 0 && validAuthority(p)
}

// AuthoritySHA256 is a policy identity, NOT a root-key fingerprint.
func AuthoritySHA256(p Policy) string {
	raw, _ := json.Marshal([]string{KeylessMode, p.SignerIssuer, p.SignerIdentity, p.Registry, p.RepositoryPrefix, p.Channel})
	return hash(raw)
}

func keylessTargets(p Policy, envelope KeylessMetadata, now time.Time) (map[string]*metadata.TargetFiles, error) {
	if !validKeylessPolicy(p) || envelope.SchemaVersion != KeylessSchema || envelope.SourceSHA != p.ExpectedSourceSHA ||
		validateManifest(p, envelope.Manifest, now) != nil || envelope.Manifest.Sequence < p.MinimumReleaseSequence || len(envelope.Artifacts) != 4 {
		return nil, ErrRelease
	}
	m := envelope.Manifest
	targets := map[string]*metadata.TargetFiles{}
	for _, name := range []string{m.ImageArchiveTarget, m.ImageBundleTarget, m.MigrationArchiveTarget, m.MigrationBundleTarget} {
		pin, ok := envelope.Artifacts[name]
		if !ok || pin.Length <= 0 || pin.Length > p.MaxArtifactBytes || !hex64.MatchString(pin.SHA256) {
			return nil, ErrRelease
		}
		digest, _ := hex.DecodeString(pin.SHA256)
		targets[name] = &metadata.TargetFiles{Length: pin.Length, Hashes: metadata.Hashes{"sha256": digest}}
	}
	return targets, nil
}

// PrepareKeyless builds unsigned bytes only. They MUST pass the mandatory
// Sigstore verifier before any TrustedRelease or publication receipt exists.
func PrepareKeyless(p Policy, m Manifest, artifacts map[string]*metadata.TargetFiles, previous State, now time.Time) ([]byte, error) {
	if !validKeylessPolicy(p) || m.Sequence <= previous.HighestReleaseSequence ||
		previous.BootstrapRootSHA256 != "" || previous.RootVersion != 0 ||
		(previous.TrustMode != "" && previous.TrustMode != KeylessMode) ||
		(previous.AuthoritySHA256 != "" && previous.AuthoritySHA256 != AuthoritySHA256(p)) {
		return nil, ErrRelease
	}
	envelope := KeylessMetadata{SchemaVersion: KeylessSchema, SourceSHA: p.ExpectedSourceSHA, Manifest: m, Artifacts: map[string]ArtifactPin{}}
	for name, tf := range artifacts {
		if tf == nil {
			return nil, ErrRelease
		}
		envelope.Artifacts[name] = ArtifactPin{Length: tf.Length, SHA256: hex.EncodeToString(tf.Hashes["sha256"])}
	}
	if _, err := keylessTargets(p, envelope, now); err != nil {
		return nil, err
	}
	return json.Marshal(envelope)
}

// VerifyKeyless never accepts unsigned metadata. The caller must authenticate
// these exact immutable bytes and the Sigstore bundle using a pinned verifier,
// exact certificate identity and issuer. Clock/sequence/state protections apply
// independently of the CI certificate signature.
func VerifyKeyless(p Policy, b Bundle, previous State, now time.Time, verify func([]byte, []byte) error) (TrustedRelease, State, error) {
	fail := func() (TrustedRelease, State, error) { return TrustedRelease{}, previous, ErrRelease }
	if !validKeylessPolicy(p) || verify == nil || now.IsZero() || now.Year() < 2026 || now.Year() > 2200 ||
		len(b.Manifest) == 0 || len(b.Manifest) > 64<<10 || len(b.KeylessSignature) == 0 || len(b.KeylessSignature) > 4<<20 ||
		len(b.BootstrapRoot) != 0 || len(b.RootUpdates) != 0 || len(b.Timestamp) != 0 || len(b.Snapshot) != 0 || len(b.Targets) != 0 ||
		previous.BootstrapRootSHA256 != "" || previous.RootVersion != 0 ||
		(previous.TrustMode != "" && previous.TrustMode != KeylessMode) ||
		(previous.AuthoritySHA256 != "" && previous.AuthoritySHA256 != AuthoritySHA256(p)) ||
		(!previous.LastTrustedTime.IsZero() && now.Before(previous.LastTrustedTime.Add(-2*time.Minute))) {
		return fail()
	}
	raw, sig := clone(b.Manifest), clone(b.KeylessSignature)
	if verify(clone(raw), clone(sig)) != nil {
		return fail()
	}
	var envelope KeylessMetadata
	if decode(raw, &envelope) != nil {
		return fail()
	}
	targets, err := keylessTargets(p, envelope, now)
	if err != nil {
		return fail()
	}
	digest := hash(raw)
	if envelope.Manifest.Sequence < previous.HighestReleaseSequence ||
		(envelope.Manifest.Sequence == previous.HighestReleaseSequence && previous.ManifestSHA256 != "" && digest != previous.ManifestSHA256) {
		return fail()
	}
	state := State{TrustMode: KeylessMode, AuthoritySHA256: AuthoritySHA256(p), SourceSHA: envelope.SourceSHA,
		HighestReleaseSequence: envelope.Manifest.Sequence, ManifestSHA256: digest, LastTrustedTime: now.UTC()}
	return TrustedRelease{manifest: envelope.Manifest, digest: digest, targets: targets, maxArtifactBytes: p.MaxArtifactBytes}, state, nil
}
