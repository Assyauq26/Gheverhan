package installer

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func zipFixture(t *testing.T, names []string, symlink bool) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "bundle.zip")
	f, e := os.Create(file)
	if e != nil {
		t.Fatal(e)
	}
	z := zip.NewWriter(f)
	for _, name := range names {
		h := &zip.FileHeader{Name: name, Method: zip.Store}
		if symlink {
			h.SetMode(os.ModeSymlink | 0777)
		} else {
			h.SetMode(0600)
		}
		w, e := z.CreateHeader(h)
		if e != nil {
			t.Fatal(e)
		}
		w.Write([]byte("synthetic payload"))
	}
	if z.Close() != nil || f.Close() != nil {
		t.Fatal("fixture archive")
	}
	return file
}
func TestPackageExtractionConfinesPathsAndRejectsAmbiguousOrOversizedEntries(t *testing.T) {
	for _, item := range []struct {
		name    string
		entries []string
		link    bool
		limit   uint64
	}{{"traversal", []string{"../escape"}, false, 1024}, {"absolute", []string{"/etc/passwd"}, false, 1024}, {"duplicate", []string{"root.json", "root.json"}, false, 1024}, {"symlink", []string{"artifacts/app.tar.gz"}, true, 1024}, {"unknown", []string{"commands.sh"}, false, 1024}, {"size", []string{"root.json"}, false, 1}} {
		t.Run(item.name, func(t *testing.T) {
			stage := t.TempDir()
			if extractPackage(zipFixture(t, item.entries, item.link), stage, "internal", item.limit) == nil {
				t.Fatal("unsafe archive accepted")
			}
		})
	}
	stage := t.TempDir()
	if extractPackage(zipFixture(t, []string{"root.json", "channels/internal/release.json", "artifacts/app.tar.gz"}, false), stage, "internal", 4096) != nil {
		t.Fatal("valid bounded data layout rejected")
	}
	if b, e := os.ReadFile(filepath.Join(stage, "root.json")); e != nil || string(b) != "synthetic payload" {
		t.Fatal("payload mismatch")
	}
}
func TestSellerDomainCannotTargetProductionOrInjectConfiguration(t *testing.T) {
	for _, domain := range []string{"gheverhan.store", "x.gheverhan.store", "buattokosendiri.web.id", "dashboard.buattokosendiri.web.id", "jetseller.web.id", "127.0.0.1", "x\n.example", "x{y.example", "x'foo.example", "-bad.example", "bad..example"} {
		if validDomain(domain) {
			t.Fatalf("unsafe domain accepted: %q", domain)
		}
	}
	for _, domain := range []string{"store.fixture.example", "shop-owner.example", "xn--bcher-kva.example"} {
		if !validDomain(domain) {
			t.Fatalf("canonical seller domain rejected: %q", domain)
		}
	}
}

func TestDisplayNameBoundary(t *testing.T) {
	for _, name := range []string{"Kopi Nusantara", "Toko & Kawan", "Kedai"} {
		if !validDisplayName(name) {
			t.Fatalf("valid name rejected")
		}
	}
	for _, name := range []string{"", " leading", "bad\nname", string([]byte{0xff}), strings.Repeat("x", 101)} {
		if validDisplayName(name) {
			t.Fatalf("unsafe name accepted")
		}
	}
}
