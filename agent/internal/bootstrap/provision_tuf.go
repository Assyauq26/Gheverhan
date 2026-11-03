package bootstrap

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/theupdateframework/go-tuf/v2/metadata/trustedmetadata"
)

var ErrProvision = errors.New("disposable provisioning blocked; preserve fixture data and inspect local prerequisites")

// FixturePlan is intentionally not a general installer/update manifest. It has
// no command, URL, host path, volume-delete or arbitrary Docker argument field.
type FixturePlan struct {
	Version        int               `json:"version"`
	InstallationID string            `json:"installation_id"`
	Platform       string            `json:"platform"`
	AppImage       string            `json:"app_image"`
	MigrationImage string            `json:"migration_image"`
	DatabaseImage  string            `json:"database_image"`
	ProxyImage     string            `json:"proxy_image"`
	Files          map[string]string `json:"files"`
}
type fixtureTrust struct {
	RootSHA      string `json:"root_sha"`
	Timestamp    int64  `json:"timestamp"`
	Snapshot     int64  `json:"snapshot"`
	Targets      int64  `json:"targets"`
	PlanSHA      string `json:"plan_sha"`
	TimestampSHA string `json:"timestamp_sha"`
	SnapshotSHA  string `json:"snapshot_sha"`
	TargetsSHA   string `json:"targets_sha"`
}

func readBoundedRegular(path string, max int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > max {
		return nil, ErrProvision
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, ErrProvision
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, max+1))
	if err != nil || int64(len(data)) > max {
		return nil, ErrProvision
	}
	return data, nil
}
func digestBytes(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }

// verifyFixtureTUF uses the upstream trustedmetadata implementation for the
// complete top-level signature/expiry/hash chain. Root rotation, delegation,
// network fetching and production root custody remain deliberately unavailable.
func verifyFixtureTUF(directory, rootPin string, previous fixtureTrust, now time.Time) (FixturePlan, fixtureTrust, error) {
	var plan FixturePlan
	if !shaPattern.MatchString(rootPin) || (previous.RootSHA != "" && previous.RootSHA != rootPin) {
		return plan, previous, ErrProvision
	}
	root, err := readBoundedRegular(filepath.Join(directory, "root.json"), 2<<20)
	if err != nil || digestBytes(root) != rootPin {
		return plan, previous, ErrProvision
	}
	trusted, err := trustedmetadata.New(root)
	if err != nil {
		return plan, previous, ErrProvision
	}
	trusted.RefTime = now.UTC()
	timestamp, err := readBoundedRegular(filepath.Join(directory, "timestamp.json"), 2<<20)
	if err != nil {
		return plan, previous, ErrProvision
	}
	if _, err = trusted.UpdateTimestamp(timestamp); err != nil {
		return plan, previous, ErrProvision
	}
	snapshot, err := readBoundedRegular(filepath.Join(directory, "snapshot.json"), 2<<20)
	if err != nil {
		return plan, previous, ErrProvision
	}
	if _, err = trusted.UpdateSnapshot(snapshot, false); err != nil {
		return plan, previous, ErrProvision
	}
	targets, err := readBoundedRegular(filepath.Join(directory, "targets.json"), 2<<20)
	if err != nil {
		return plan, previous, ErrProvision
	}
	if _, err = trusted.UpdateTargets(targets); err != nil {
		return plan, previous, ErrProvision
	}
	target := trusted.Targets["targets"].Signed.Targets["fixture-plan.json"]
	raw, err := readBoundedRegular(filepath.Join(directory, "fixture-plan.json"), 64<<10)
	if err != nil || target == nil || target.VerifyLengthHashes(raw) != nil {
		return plan, previous, ErrProvision
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&plan) != nil || decoder.Decode(new(any)) != io.EOF {
		return plan, previous, ErrProvision
	}
	current := fixtureTrust{RootSHA: rootPin, Timestamp: trusted.Timestamp.Signed.Version, Snapshot: trusted.Snapshot.Signed.Version, Targets: trusted.Targets["targets"].Signed.Version, PlanSHA: digestBytes(raw), TimestampSHA: digestBytes(timestamp), SnapshotSHA: digestBytes(snapshot), TargetsSHA: digestBytes(targets)}
	if (previous.TimestampSHA != "" && current.Timestamp == previous.Timestamp && current.TimestampSHA != previous.TimestampSHA) || (previous.SnapshotSHA != "" && current.Snapshot == previous.Snapshot && current.SnapshotSHA != previous.SnapshotSHA) || (previous.TargetsSHA != "" && current.Targets == previous.Targets && current.TargetsSHA != previous.TargetsSHA) || current.Timestamp < previous.Timestamp || current.Snapshot < previous.Snapshot || current.Targets < previous.Targets || (previous.PlanSHA != "" && current.Targets == previous.Targets && current.PlanSHA != previous.PlanSHA) {
		return plan, previous, ErrProvision
	}
	return plan, current, nil
}
