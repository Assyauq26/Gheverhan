package releaseprotocol

import (
	"crypto"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/json"
	"github.com/sigstore/sigstore/pkg/signature"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"time"
)

// Publication signs online roles only. It never creates roots, publishes bytes,
// generates production keys, or substitutes a root pin from the release itself.
type Publication struct {
	Policy    Policy
	Root      []byte
	Manifest  Manifest
	Previous  State
	Version   int64
	Artifacts map[string]*metadata.TargetFiles
	Keys      map[string]ed25519.PrivateKey
}

func publishSign[T metadata.RootType | metadata.TimestampType | metadata.SnapshotType | metadata.TargetsType](m *metadata.Metadata[T], key ed25519.PrivateKey) ([]byte, error) {
	if len(key) != ed25519.PrivateKeySize {
		return nil, ErrRelease
	}
	signer, e := signature.LoadSigner(key, crypto.Hash(0))
	if e != nil {
		return nil, e
	}
	if _, e = m.Sign(signer); e != nil {
		return nil, e
	}
	return m.ToBytes(false)
}
func publishMeta(raw []byte, v int64) *metadata.MetaFiles {
	h := sha256.Sum256(raw)
	m := metadata.MetaFile(v)
	m.Length = int64(len(raw))
	m.Hashes = metadata.Hashes{"sha256": h[:]}
	return m
}

// Publish rejects stale versions/sequence and validates its own signatures using
// the SAME independent root and verifier used by the installer before returning.
func Publish(p Publication, now time.Time) (Bundle, State, error) {
	bad := func() (Bundle, State, error) { return Bundle{}, State{}, ErrRelease }
	if !validPolicy(p.Policy) || hash(p.Root) != p.Policy.BootstrapRootSHA256 || validateManifest(p.Policy, p.Manifest, now) != nil || p.Version < 1 || p.Version <= p.Previous.TargetsVersion || p.Version <= p.Previous.SnapshotVersion || p.Version <= p.Previous.TimestampVersion || p.Manifest.Sequence <= p.Previous.HighestReleaseSequence {
		return bad()
	}
	raw, e := json.Marshal(p.Manifest)
	if e != nil {
		return bad()
	}
	targets := metadata.Targets(p.Manifest.ExpiresAt)
	targets.Signed.Version = p.Version
	for _, name := range []string{p.Manifest.ImageArchiveTarget, p.Manifest.ImageBundleTarget, p.Manifest.MigrationArchiveTarget, p.Manifest.MigrationBundleTarget} {
		tf := p.Artifacts[name]
		if tf == nil || tf.Length <= 0 || tf.Length > p.Policy.MaxArtifactBytes || len(tf.Hashes["sha256"]) != 32 {
			return bad()
		}
		targets.Signed.Targets[name] = tf
	}
	tf, e := metadata.TargetFile().FromBytes("channels/"+p.Policy.Channel+"/release.json", raw, "sha256")
	if e != nil {
		return bad()
	}
	targets.Signed.Targets[tf.Path] = tf
	rt, e := publishSign(targets, p.Keys["targets"])
	if e != nil {
		return bad()
	}
	snapshot := metadata.Snapshot(p.Manifest.ExpiresAt)
	snapshot.Signed.Version = p.Version
	snapshot.Signed.Meta["targets.json"] = publishMeta(rt, p.Version)
	rs, e := publishSign(snapshot, p.Keys["snapshot"])
	if e != nil {
		return bad()
	}
	timestamp := metadata.Timestamp(p.Manifest.ExpiresAt)
	timestamp.Signed.Version = p.Version
	timestamp.Signed.Meta["snapshot.json"] = publishMeta(rs, p.Version)
	rts, e := publishSign(timestamp, p.Keys["timestamp"])
	if e != nil {
		return bad()
	}
	b := Bundle{BootstrapRoot: p.Root, Targets: rt, Snapshot: rs, Timestamp: rts, Manifest: raw}
	_, state, e := Verify(p.Policy, b, p.Previous, now)
	if e != nil {
		return bad()
	}
	return b, state, nil
}
