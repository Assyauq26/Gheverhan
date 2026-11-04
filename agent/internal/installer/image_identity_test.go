package installer

import (
	"context"
	"strings"
	"testing"
)

type imageLookup func(context.Context, ...string) ([]byte, error)

func (f imageLookup) run(c context.Context, a ...string) ([]byte, error) { return f(c, a...) }
func TestLoadedImageRequiresAnApprovedExactDigest(t *testing.T) {
	config, registry, archive := strings.Repeat("a", 64), strings.Repeat("b", 64), strings.Repeat("c", 64)
	ref := "registry.fixture.example/app@sha256:" + registry
	for _, available := range []string{config, registry, archive} {
		calls := 0
		d := imageLookup(func(_ context.Context, a ...string) ([]byte, error) {
			calls++
			if a[len(a)-1] == "sha256:"+available {
				return []byte("sha256:" + available + "\n"), nil
			}
			return nil, ErrInstall
		})
		id, e := loadedImage(context.Background(), d, config, ref, archive)
		if e != nil || id != "sha256:"+available || calls < 1 {
			t.Fatal("approved classic/registry/archive digest rejected")
		}
	}
	d := imageLookup(func(_ context.Context, a ...string) ([]byte, error) {
		return []byte("sha256:" + strings.Repeat("d", 64)), nil
	})
	if _, e := loadedImage(context.Background(), d, config, ref, archive); e == nil {
		t.Fatal("unapproved daemon image accepted")
	}
	d = imageLookup(func(_ context.Context, a ...string) ([]byte, error) {
		if a[len(a)-1] == "sha256:"+archive {
			return []byte("sha256:" + archive), nil
		}
		return nil, ErrInstall
	})
	if _, e := loadedImage(context.Background(), d, config, ref, ""); e == nil {
		t.Fatal("archive digest accepted without signed metadata")
	}
}
