// jetseller-publish prepares signed metadata; never creates production root keys.
package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type config struct {
	Policy                                                                        releaseprotocol.Policy
	RootFile, ManifestFile, PreviousStateFile, ArtifactDirectory, OutputDirectory string
	Version                                                                       int64
	Keys                                                                          map[string]string
}

func read(file string, secret bool) ([]byte, error) {
	st, e := os.Lstat(file)
	if e != nil || !filepath.IsAbs(file) || !st.Mode().IsRegular() || st.Size() > 1<<20 || st.Mode().Perm()&0022 != 0 || (secret && st.Mode().Perm()&0077 != 0) {
		return nil, fmt.Errorf("protected publication input required")
	}
	return os.ReadFile(file)
}
func decode(b []byte, v any) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return e
	}
	if d.Decode(new(any)) != io.EOF {
		return fmt.Errorf("invalid input")
	}
	return nil
}
func run() error {
	if len(os.Args) == 3 && os.Args[1] == "check-root" {
		raw, e := read(os.Args[2], true)
		if e != nil {
			return e
		}
		var c config
		if decode(raw, &c) != nil {
			return fmt.Errorf("invalid config")
		}
		root, e := read(c.RootFile, false)
		if e != nil {
			return e
		}
		return releaseprotocol.VerifyBootstrapRoot(root, c.Policy.BootstrapRootSHA256, c.Policy.MinimumRootThreshold, time.Now())
	}
	if len(os.Args) != 2 {
		return fmt.Errorf("publication config required")
	}
	raw, e := read(os.Args[1], true)
	if e != nil {
		return e
	}
	var c config
	if e = decode(raw, &c); e != nil {
		return e
	}
	root, e := read(c.RootFile, false)
	if e != nil {
		return e
	}
	raw, e = read(c.ManifestFile, false)
	if e != nil {
		return e
	}
	var m releaseprotocol.Manifest
	if e = decode(raw, &m); e != nil {
		return e
	}
	raw, e = read(c.PreviousStateFile, true)
	if e != nil {
		return e
	}
	var previous releaseprotocol.State
	if e = decode(raw, &previous); e != nil {
		return e
	}
	p := releaseprotocol.Publication{Policy: c.Policy, Root: root, Manifest: m, Previous: previous, Version: c.Version, Keys: map[string]ed25519.PrivateKey{}, Artifacts: map[string]*metadata.TargetFiles{}}
	for _, role := range []string{"targets", "snapshot", "timestamp"} {
		b, e := read(c.Keys[role], true)
		if e != nil {
			return e
		}
		block, _ := pem.Decode(b)
		if block == nil {
			return fmt.Errorf("PKCS8 signer required")
		}
		k, e := x509.ParsePKCS8PrivateKey(block.Bytes)
		if e != nil {
			return e
		}
		key, ok := k.(ed25519.PrivateKey)
		if !ok {
			return fmt.Errorf("Ed25519 signer required")
		}
		p.Keys[role] = key
	}
	for _, name := range []string{m.ImageArchiveTarget, m.ImageBundleTarget, m.MigrationArchiveTarget, m.MigrationBundleTarget} {
		if filepath.ToSlash(filepath.Clean(name)) != name || !strings.HasPrefix(name, "artifacts/") || strings.Contains(name, "..") || !filepath.IsAbs(c.ArtifactDirectory) {
			return fmt.Errorf("invalid target")
		}
		file := filepath.Join(c.ArtifactDirectory, filepath.FromSlash(name))
		st, e := os.Lstat(file)
		if e != nil || !st.Mode().IsRegular() || st.Size() > c.Policy.MaxArtifactBytes {
			return fmt.Errorf("invalid artifact")
		}
		tf, e := metadata.TargetFile().FromFile(file, "sha256")
		if e != nil {
			return e
		}
		p.Artifacts[name] = tf
	}
	b, state, e := releaseprotocol.Publish(p, time.Now().UTC())
	if e != nil {
		return e
	}
	if !filepath.IsAbs(c.OutputDirectory) {
		return fmt.Errorf("absolute fresh output required")
	}
	if e = os.Mkdir(c.OutputDirectory, 0700); e != nil {
		return e
	}
	files := map[string][]byte{"root.json": b.BootstrapRoot, "targets.json": b.Targets, "snapshot.json": b.Snapshot, "timestamp.json": b.Timestamp, "channels/" + m.Channel + "/release.json": b.Manifest}
	sb, _ := json.Marshal(state)
	files["candidate-state.json"] = sb
	for name, data := range files {
		file := filepath.Join(c.OutputDirectory, filepath.FromSlash(name))
		if e = os.MkdirAll(filepath.Dir(file), 0700); e != nil {
			return e
		}
		if e = os.WriteFile(file, data, 0600); e != nil {
			return e
		}
	}
	fmt.Println("Signed metadata candidate verified; publish only after artifact signature verification and release approval")
	return nil
}
func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "Publication refused; inspect protected inputs and approved signing configuration")
		os.Exit(1)
	}
}
