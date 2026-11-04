package main

import (
	"fmt"
	"github.com/Assyauq26/Gheverhan/agent/internal/releaseprotocol"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func prepareKeyless(c config) error {
	if c.RootFile != "" || len(c.RootUpdateFiles) != 0 || len(c.Keys) != 0 {
		return fmt.Errorf("root inputs forbidden for keyless release")
	}
	raw, e := read(c.ManifestFile, false)
	if e != nil {
		return e
	}
	var manifest releaseprotocol.Manifest
	if decode(raw, &manifest) != nil {
		return fmt.Errorf("manifest required")
	}
	raw, e = read(c.PreviousStateFile, true)
	if e != nil {
		return e
	}
	var previous releaseprotocol.State
	if decode(raw, &previous) != nil {
		return fmt.Errorf("previous state required")
	}
	artifacts := map[string]*metadata.TargetFiles{}
	for _, name := range []string{manifest.ImageArchiveTarget, manifest.ImageBundleTarget, manifest.MigrationArchiveTarget, manifest.MigrationBundleTarget} {
		if filepath.ToSlash(filepath.Clean(name)) != name || !strings.HasPrefix(name, "artifacts/") || strings.Contains(name, "..") || !filepath.IsAbs(c.ArtifactDirectory) {
			return fmt.Errorf("invalid target")
		}
		file := filepath.Join(c.ArtifactDirectory, filepath.FromSlash(name))
		st, e := os.Lstat(file)
		if e != nil || !st.Mode().IsRegular() || st.Size() <= 0 || st.Size() > c.Policy.MaxArtifactBytes {
			return fmt.Errorf("invalid artifact")
		}
		tf, e := metadata.TargetFile().FromFile(file, "sha256")
		if e != nil {
			return e
		}
		artifacts[name] = tf
	}
	raw, e = releaseprotocol.PrepareKeyless(c.Policy, manifest, artifacts, previous, time.Now().UTC())
	if e != nil {
		return e
	}
	if !filepath.IsAbs(c.OutputDirectory) || os.Mkdir(c.OutputDirectory, 0700) != nil {
		return fmt.Errorf("fresh absolute output required")
	}
	file := filepath.Join(c.OutputDirectory, "channels", manifest.Channel, "release.json")
	if os.MkdirAll(filepath.Dir(file), 0700) != nil {
		return fmt.Errorf("output refused")
	}
	if os.WriteFile(file, raw, 0600) != nil {
		return fmt.Errorf("output refused")
	}
	fmt.Println("Unsigned keyless metadata prepared; mandatory Cosign signature and independent verification receipt still required")
	return nil
}
