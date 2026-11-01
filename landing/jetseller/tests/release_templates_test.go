package release_test

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"text/template"
)

// Parse the literal templates used by operators, rather than copying the fixed
// template into the test. No Docker daemon or production access is needed.
func TestDockerTemplates(t *testing.T) {
	formats := regexp.MustCompile(`--format '([^']+)'`)
	fixtures := []struct{ Source, Destination, Mode string }{
		{"/fixture/config", "/config", "rw"},
		{"/fixture/data", "/data", "rw"},
		{"/fixture/other", "/other", "ro"},
	}
	count := 0
	for _, file := range []string{"release-v3-from-vps.sh", "RUNBOOK.md", "RELEASE-V3.md"} {
		content, err := os.ReadFile(filepath.Join("..", "deploy", file))
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range formats.FindAllSubmatch(content, -1) {
			count++
			format := string(match[1])
			t.Run(file+"/"+format, func(t *testing.T) {
				tmpl, err := template.New("inspect").Parse(format)
				if err != nil {
					t.Fatal(err)
				}
				data := map[string]any{"Mounts": fixtures, "Names": "proxy", "Image": "caddy", "Status": "Up", "Ports": "443"}
				var out bytes.Buffer
				if err := tmpl.Execute(&out, data); err != nil {
					t.Fatal(err)
				}
				if strings.Contains(format, `eq .Destination "/data"`) {
					if out.String() != "/fixture/data" {
						t.Fatalf("wrong mount: %q", out.String())
					}
					data["Mounts"] = fixtures[:1]
					out.Reset()
					if err := tmpl.Execute(&out, data); err != nil {
						t.Fatal(err)
					}
					if out.Len() != 0 {
						t.Fatalf("missing mount returned %q", out.String())
					}
				}
			})
		}
	}
	if count != 7 {
		t.Fatalf("expected 7 audited Docker templates, found %d", count)
	}
}

func TestOriginalBrokenTemplateIsRejected(t *testing.T) {
	_, err := template.New("broken").Parse(`{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}`)
	if err == nil || !strings.Contains(err.Error(), "unexpected EOF") {
		t.Fatalf("expected original failure, got %v", err)
	}
}
