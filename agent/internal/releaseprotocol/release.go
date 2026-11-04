// Package releaseprotocol verifies release metadata and compatibility before any
// privileged action. It never executes Docker, downloads a script, or authorizes
// a signing root obtained from the same untrusted metadata repository.
package releaseprotocol

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/theupdateframework/go-tuf/v2/metadata"
	"github.com/theupdateframework/go-tuf/v2/metadata/trustedmetadata"
)

var ErrRelease = errors.New("release verification or compatibility rejected")
var hex64 = regexp.MustCompile(`^[a-f0-9]{64}$`)
var imagePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.:-]*/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$`)
var targetPattern = regexp.MustCompile(`^artifacts/[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$`)
var appVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-rc\.[1-9][0-9]*)?$`)

// Policy comes from independently provisioned, locally protected configuration;
// none of these authority fields may be supplied by an untrusted portal request.
type Policy struct {
	BootstrapRootSHA256  string
	Channel              string
	Registry             string
	RepositoryPrefix     string
	SignerIssuer         string
	SignerIdentity       string
	MinimumRootThreshold int
	MaxArtifactBytes     int64
}

type Manifest struct {
	SchemaVersion            string    `json:"schema_version"`
	ReleaseID                string    `json:"release_id"`
	Sequence                 uint64    `json:"sequence"`
	AppVersion               string    `json:"app_version"`
	Channel                  string    `json:"channel"`
	Platform                 string    `json:"platform"`
	OS                       string    `json:"os"`
	Image                    string    `json:"image"`
	ImageConfigSHA256        string    `json:"image_config_sha256"`
	ImageArchiveTarget       string    `json:"image_archive_target"`
	ImageBundleTarget        string    `json:"image_bundle_target"`
	MigrationImage           string    `json:"migration_image"`
	MigrationConfigSHA256    string    `json:"migration_config_sha256"`
	MigrationArchiveTarget   string    `json:"migration_archive_target"`
	MigrationBundleTarget    string    `json:"migration_bundle_target"`
	SignerIssuer             string    `json:"signer_issuer"`
	SignerIdentity           string    `json:"signer_identity"`
	MinAgentVersion          string    `json:"min_agent_version"`
	MaxAgentVersion          string    `json:"max_agent_version"`
	ProtocolVersion          int       `json:"protocol_version"`
	ComposeTemplateVersion   int       `json:"compose_template_version"`
	MinStoreSchemaVersion    int64     `json:"min_store_schema_version"`
	MaxStoreSchemaVersion    int64     `json:"max_store_schema_version"`
	TargetSchemaVersion      int64     `json:"target_schema_version"`
	MigrationPolicy          string    `json:"migration_policy"`
	NotBefore                time.Time `json:"not_before"`
	ExpiresAt                time.Time `json:"expires_at"`
	RequiresBackup           bool      `json:"requires_backup"`
	RequiresOperatorApproval bool      `json:"requires_operator_approval"`
	Revoked                  bool      `json:"revoked"`
}

// Bundle is a bounded snapshot obtained by the caller. Artifact payloads are
// separately streamed through VerifyTarget; large image archives are not loaded
// into this object. RootUpdates are sequential N+1 roots, never a replacement pin.
type Bundle struct {
	BootstrapRoot []byte
	RootUpdates   [][]byte
	Timestamp     []byte
	Snapshot      []byte
	Targets       []byte
	Manifest      []byte
}

type State struct {
	BootstrapRootSHA256    string    `json:"bootstrap_root_sha256"`
	RootVersion            int64     `json:"root_version"`
	RootSHA256             string    `json:"root_sha256"`
	TimestampVersion       int64     `json:"timestamp_version"`
	SnapshotVersion        int64     `json:"snapshot_version"`
	TargetsVersion         int64     `json:"targets_version"`
	TimestampSHA256        string    `json:"timestamp_sha256"`
	SnapshotSHA256         string    `json:"snapshot_sha256"`
	TargetsSHA256          string    `json:"targets_sha256"`
	HighestReleaseSequence uint64    `json:"highest_release_sequence"`
	ManifestSHA256         string    `json:"manifest_sha256"`
	LastTrustedTime        time.Time `json:"last_trusted_time"`
}

// TrustedRelease has no exported fields. Metadata trust does NOT imply that
// image signatures were verified or that an installation/update was executed.
type TrustedRelease struct {
	manifest         Manifest
	digest           string
	targets          map[string]*metadata.TargetFiles
	maxArtifactBytes int64
}

func (r TrustedRelease) Manifest() Manifest { return r.manifest }
func (r TrustedRelease) SHA256() string     { return r.digest }
func (r TrustedRelease) TargetSize(name string) (int64, error) {
	tf := r.targets[name]
	if r.digest == "" || tf == nil || tf.Length <= 0 || tf.Length > r.maxArtifactBytes {
		return 0, ErrRelease
	}
	return tf.Length, nil
}
func hash(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func decode(raw []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(out) != nil || d.Decode(new(any)) != io.EOF {
		return ErrRelease
	}
	return nil
}
func validPolicy(p Policy) bool {
	return hex64.MatchString(p.BootstrapRootSHA256) && (p.Channel == "internal" || p.Channel == "pilot" || p.Channel == "stable") &&
		p.Registry != "" && !strings.ContainsAny(p.Registry, "/@?#\\ \t\r\n") && p.RepositoryPrefix != "" &&
		imagePattern.MatchString(p.Registry+"/"+p.RepositoryPrefix+"/probe@sha256:"+strings.Repeat("0", 64)) &&
		strings.HasPrefix(p.SignerIssuer, "https://") && strings.HasPrefix(p.SignerIdentity, "https://") &&
		p.MinimumRootThreshold >= 2 && p.MaxArtifactBytes > 0 && p.MaxArtifactBytes <= 8<<30
}
func monotonic(version, old int64, digest, oldDigest string) bool {
	return version >= old && (version != old || oldDigest == "" || digest == oldDigest)
}
func clone(raw []byte) []byte { return append([]byte(nil), raw...) }

func Verify(p Policy, b Bundle, previous State, now time.Time) (TrustedRelease, State, error) {
	fail := func() (TrustedRelease, State, error) { return TrustedRelease{}, previous, ErrRelease }
	if !validPolicy(p) || now.IsZero() || now.Year() < 2026 || now.Year() > 2200 || len(b.BootstrapRoot) > 2<<20 || len(b.RootUpdates) > 64 || len(b.Timestamp) > 2<<20 || len(b.Snapshot) > 2<<20 || len(b.Targets) > 2<<20 || len(b.Manifest) > 64<<10 {
		return fail()
	}
	if !previous.LastTrustedTime.IsZero() && now.Before(previous.LastTrustedTime.Add(-2*time.Minute)) {
		return fail()
	}
	if previous.BootstrapRootSHA256 != "" && previous.BootstrapRootSHA256 != p.BootstrapRootSHA256 {
		return fail()
	}
	root := clone(b.BootstrapRoot)
	if hash(root) != p.BootstrapRootSHA256 {
		return fail()
	}
	trusted, err := trustedmetadata.New(root)
	if err != nil {
		return fail()
	}
	trusted.RefTime = now.UTC()
	// Never silently accept a one-key production root, including during rotation.
	rootThreshold := func() bool {
		role := trusted.Root.Signed.Roles["root"]
		return role != nil && role.Threshold >= p.MinimumRootThreshold
	}
	if !rootThreshold() {
		return fail()
	}
	rootDigest := hash(root)
	for _, raw := range b.RootUpdates {
		if len(raw) > 2<<20 {
			return fail()
		}
		raw = clone(raw)
		if _, err = trusted.UpdateRoot(raw); err != nil || !rootThreshold() {
			return fail()
		}
		rootDigest = hash(raw)
	}
	if !monotonic(trusted.Root.Signed.Version, previous.RootVersion, rootDigest, previous.RootSHA256) {
		return fail()
	}
	timestamp, snapshot, targets := clone(b.Timestamp), clone(b.Snapshot), clone(b.Targets)
	if _, err = trusted.UpdateTimestamp(timestamp); err != nil {
		return fail()
	}
	if _, err = trusted.UpdateSnapshot(snapshot, false); err != nil {
		return fail()
	}
	if _, err = trusted.UpdateTargets(targets); err != nil {
		return fail()
	}
	targetName := "channels/" + p.Channel + "/release.json"
	signedTarget := trusted.Targets["targets"].Signed.Targets[targetName]
	manifestRaw := clone(b.Manifest)
	if signedTarget == nil || signedTarget.VerifyLengthHashes(manifestRaw) != nil {
		return fail()
	}
	var m Manifest
	if decode(manifestRaw, &m) != nil || validateManifest(p, m, now) != nil {
		return fail()
	}
	current := State{BootstrapRootSHA256: p.BootstrapRootSHA256, RootVersion: trusted.Root.Signed.Version, RootSHA256: rootDigest, TimestampVersion: trusted.Timestamp.Signed.Version, SnapshotVersion: trusted.Snapshot.Signed.Version, TargetsVersion: trusted.Targets["targets"].Signed.Version, TimestampSHA256: hash(timestamp), SnapshotSHA256: hash(snapshot), TargetsSHA256: hash(targets), HighestReleaseSequence: m.Sequence, ManifestSHA256: hash(manifestRaw), LastTrustedTime: now.UTC()}
	if !monotonic(current.TimestampVersion, previous.TimestampVersion, current.TimestampSHA256, previous.TimestampSHA256) || !monotonic(current.SnapshotVersion, previous.SnapshotVersion, current.SnapshotSHA256, previous.SnapshotSHA256) || !monotonic(current.TargetsVersion, previous.TargetsVersion, current.TargetsSHA256, previous.TargetsSHA256) || m.Sequence < previous.HighestReleaseSequence || (m.Sequence == previous.HighestReleaseSequence && previous.ManifestSHA256 != "" && current.ManifestSHA256 != previous.ManifestSHA256) {
		return fail()
	}
	protectedTargets := map[string]*metadata.TargetFiles{}
	for _, name := range []string{m.ImageArchiveTarget, m.ImageBundleTarget, m.MigrationArchiveTarget, m.MigrationBundleTarget} {
		tf := trusted.Targets["targets"].Signed.Targets[name]
		if tf == nil || tf.Length <= 0 || tf.Length > p.MaxArtifactBytes || len(tf.Hashes["sha256"]) != 32 {
			return fail()
		}
		copyTarget := *tf
		copyTarget.Hashes = metadata.Hashes{"sha256": clone(tf.Hashes["sha256"])}
		protectedTargets[name] = &copyTarget
	}
	return TrustedRelease{manifest: m, digest: current.ManifestSHA256, targets: protectedTargets, maxArtifactBytes: p.MaxArtifactBytes}, current, nil
}
func validateManifest(p Policy, m Manifest, now time.Time) error {
	if !hex64.MatchString(m.ImageConfigSHA256) || !hex64.MatchString(m.MigrationConfigSHA256) || m.SchemaVersion != "1" || m.Sequence == 0 || !appVersionPattern.MatchString(m.AppVersion) || m.ReleaseID != "rel-"+m.AppVersion+"-"+p.Channel || m.Channel != p.Channel || m.Platform != "linux/amd64" || m.OS != "ubuntu:24.04" || m.ProtocolVersion != 1 || m.ComposeTemplateVersion != 1 || m.SignerIssuer != p.SignerIssuer || m.SignerIdentity != p.SignerIdentity || m.Revoked {
		return ErrRelease
	}
	prefix := p.Registry + "/" + p.RepositoryPrefix + "/"
	for _, image := range []string{m.Image, m.MigrationImage} {
		if !imagePattern.MatchString(image) || !strings.HasPrefix(image, prefix) {
			return ErrRelease
		}
	}
	if m.Image == m.MigrationImage {
		return ErrRelease
	}
	names := map[string]bool{}
	for _, name := range []string{m.ImageArchiveTarget, m.ImageBundleTarget, m.MigrationArchiveTarget, m.MigrationBundleTarget} {
		if !targetPattern.MatchString(name) || strings.Contains(name, "..") || names[name] {
			return ErrRelease
		}
		names[name] = true
	}
	if m.NotBefore.IsZero() || m.ExpiresAt.IsZero() || now.Before(m.NotBefore) || !now.Before(m.ExpiresAt) || !m.ExpiresAt.After(m.NotBefore) || m.ExpiresAt.Sub(m.NotBefore) > 7*24*time.Hour {
		return ErrRelease
	}
	if m.MinStoreSchemaVersion < 0 || m.MaxStoreSchemaVersion < m.MinStoreSchemaVersion || m.TargetSchemaVersion < m.MinStoreSchemaVersion || m.TargetSchemaVersion > m.MaxStoreSchemaVersion || m.MigrationPolicy != "compatible_expand_only" || !m.RequiresOperatorApproval {
		return ErrRelease
	}
	min, ok := version(m.MinAgentVersion)
	if !ok {
		return ErrRelease
	}
	max, ok := version(m.MaxAgentVersion)
	if !ok || compare(min, max) > 0 {
		return ErrRelease
	}
	return nil
}

// VerifyTarget checks authenticated TUF length/hash with bounded streaming; it
// does not substitute for the separately pinned Cosign image/archive verifier.
func (r TrustedRelease) VerifyTarget(name string, input io.Reader) error {
	tf := r.targets[name]
	if tf == nil || r.digest == "" || tf.Length <= 0 || tf.Length > r.maxArtifactBytes || input == nil {
		return ErrRelease
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(input, tf.Length+1))
	if err != nil || n != tf.Length || subtle.ConstantTimeCompare(h.Sum(nil), tf.Hashes["sha256"]) != 1 {
		return ErrRelease
	}
	return nil
}

type Host struct {
	OS, Platform, AgentVersion              string
	ProtocolVersion, ComposeTemplateVersion int
	SchemaVersion                           int64
}

func (r TrustedRelease) Compatible(h Host) error {
	m := r.manifest
	if r.digest == "" || h.OS != m.OS || h.Platform != m.Platform || h.ProtocolVersion != m.ProtocolVersion || h.ComposeTemplateVersion != m.ComposeTemplateVersion || h.SchemaVersion < m.MinStoreSchemaVersion || h.SchemaVersion > m.MaxStoreSchemaVersion || h.SchemaVersion > m.TargetSchemaVersion {
		return ErrRelease
	}
	actual, ok := version(h.AgentVersion)
	if !ok {
		return ErrRelease
	}
	min, _ := version(m.MinAgentVersion)
	max, _ := version(m.MaxAgentVersion)
	if compare(actual, min) < 0 || compare(actual, max) > 0 {
		return ErrRelease
	}
	return nil
}
func version(s string) ([3]uint64, bool) {
	var v [3]uint64
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return v, false
	}
	for i, p := range parts {
		if p == "" || (len(p) > 1 && p[0] == '0') {
			return v, false
		}
		for _, c := range p {
			if c < '0' || c > '9' {
				return v, false
			}
		}
		n, e := strconv.ParseUint(p, 10, 32)
		if e != nil {
			return v, false
		}
		v[i] = n
	}
	return v, true
}
func compare(a, b [3]uint64) int {
	for i := range a {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}
