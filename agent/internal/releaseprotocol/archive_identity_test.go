package releaseprotocol

import (
	"strings"
	"testing"
)

func TestArchiveManifestPinsArePairedValidatedSignedFields(t *testing.T) {
	f := fresh(t)
	m := f.manifest()
	m.ImageArchiveSHA256 = strings.Repeat("e", 64)
	m.MigrationArchiveSHA256 = strings.Repeat("f", 64)
	if e := validateManifest(f.policy, m, f.now); e != nil {
		t.Fatal(e)
	}
	for _, pins := range [][2]string{{m.ImageArchiveSHA256, ""}, {"", m.MigrationArchiveSHA256}, {"bad", m.MigrationArchiveSHA256}} {
		invalid := m
		invalid.ImageArchiveSHA256, invalid.MigrationArchiveSHA256 = pins[0], pins[1]
		if validateManifest(f.policy, invalid, f.now) == nil {
			t.Fatal("invalid archive identity admitted")
		}
	}
}
