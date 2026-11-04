// Offline custody tool. Never run in GitHub Actions or on a seller VPS.
package main

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"github.com/sigstore/sigstore/pkg/signature"
	"github.com/theupdateframework/go-tuf/v2/metadata"
	"os"
	"path/filepath"
	"time"
)

func initRoot(out string, now time.Time) (string, error) {
	if !filepath.IsAbs(out) {
		return "", fmt.Errorf("absolute offline directory required")
	}
	if e := os.Mkdir(out, 0700); e != nil {
		return "", e
	}
	root := metadata.Root(now.Add(365 * 24 * time.Hour))
	root.Signed.Version = 1
	root.Signed.Roles["root"].Threshold = 2
	var roots []ed25519.PrivateKey
	for _, role := range []string{"root", "targets", "snapshot", "timestamp"} {
		count := 1
		if role == "root" {
			count = 3
		}
		for i := 1; i <= count; i++ {
			pub, key, e := ed25519.GenerateKey(rand.Reader)
			if e != nil {
				return "", e
			}
			tuf, e := metadata.KeyFromPublicKey(pub)
			if e != nil {
				return "", e
			}
			if e = root.Signed.AddKey(tuf, role); e != nil {
				return "", e
			}
			if role == "root" {
				roots = append(roots, key)
			}
			raw, e := x509.MarshalPKCS8PrivateKey(key)
			if e != nil {
				return "", e
			}
			name := fmt.Sprintf("%s-%d.pem", role, i)
			if e = os.WriteFile(filepath.Join(out, name), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: raw}), 0600); e != nil {
				return "", e
			}
		}
	}
	for _, k := range roots {
		signer, e := signature.LoadSigner(k, crypto.Hash(0))
		if e != nil {
			return "", e
		}
		if _, e = root.Sign(signer); e != nil {
			return "", e
		}
	}
	if e := root.VerifyDelegate("root", root); e != nil {
		return "", e
	}
	raw, e := root.ToBytes(false)
	if e != nil {
		return "", e
	}
	if e = os.WriteFile(filepath.Join(out, "1.root.json"), raw, 0600); e != nil {
		return "", e
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
func read(file string) ([]byte, error) {
	st, e := os.Lstat(file)
	if e != nil || !filepath.IsAbs(file) || !st.Mode().IsRegular() || st.Size() > 1<<20 || st.Mode().Perm()&0077 != 0 {
		return nil, fmt.Errorf("private offline file required")
	}
	return os.ReadFile(file)
}
func rotate(configFile string) error {
	raw, e := read(configFile)
	if e != nil {
		return e
	}
	var c struct {
		PreviousRoot, CandidateRoot, OutputFile string
		PreviousRootSHA256, CandidateRootSHA256 string
		SigningKeys                             []string
	}
	if json.Unmarshal(raw, &c) != nil {
		return fmt.Errorf("rotation config required")
	}
	raw, e = read(c.PreviousRoot)
	if e != nil {
		return e
	}
	previousHash := sha256.Sum256(raw)
	if hex.EncodeToString(previousHash[:]) != c.PreviousRootSHA256 {
		return fmt.Errorf("independent previous root pin mismatch")
	}
	old, e := metadata.Root().FromBytes(raw)
	if e != nil {
		return e
	}
	raw, e = read(c.CandidateRoot)
	if e != nil {
		return e
	}
	candidateHash := sha256.Sum256(raw)
	if hex.EncodeToString(candidateHash[:]) != c.CandidateRootSHA256 {
		return fmt.Errorf("reviewed candidate hash mismatch")
	}
	next, e := metadata.Root().FromBytes(raw)
	if e != nil {
		return e
	}
	if next.Signed.Version != old.Signed.Version+1 || next.Signed.Roles["root"] == nil || next.Signed.Roles["root"].Threshold < 2 || !next.Signed.Expires.After(time.Now()) || next.Signed.Expires.After(time.Now().Add(366*24*time.Hour)) {
		return fmt.Errorf("invalid rotation")
	}
	for _, file := range c.SigningKeys {
		raw, e := read(file)
		if e != nil {
			return e
		}
		block, _ := pem.Decode(raw)
		if block == nil {
			return fmt.Errorf("PKCS8 required")
		}
		key, e := x509.ParsePKCS8PrivateKey(block.Bytes)
		if e != nil {
			return e
		}
		ed, ok := key.(ed25519.PrivateKey)
		if !ok {
			return fmt.Errorf("Ed25519 required")
		}
		signer, e := signature.LoadSigner(ed, crypto.Hash(0))
		if e != nil {
			return e
		}
		if _, e = next.Sign(signer); e != nil {
			return e
		}
	}
	if old.VerifyDelegate("root", next) != nil || next.VerifyDelegate("root", next) != nil {
		return fmt.Errorf("old and new quorum required")
	}
	raw, e = next.ToBytes(false)
	if e != nil {
		return e
	}
	if !filepath.IsAbs(c.OutputFile) {
		return fmt.Errorf("absolute fresh output required")
	}
	f, e := os.OpenFile(c.OutputFile, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	defer f.Close()
	if _, e = f.Write(raw); e != nil {
		return e
	}
	return f.Sync()
}
func run() error {
	if os.Getenv("CI") != "" || os.Getenv("GITHUB_ACTIONS") != "" || len(os.Args) != 4 || os.Args[3] != "offline-encrypted-custody" {
		return fmt.Errorf("offline explicit custody required")
	}
	target := os.Args[2]
	if !filepath.IsAbs(target) {
		return fmt.Errorf("absolute offline path required")
	}
	for p := filepath.Dir(target); ; p = filepath.Dir(p) {
		if _, e := os.Lstat(filepath.Join(p, ".git")); e == nil {
			return fmt.Errorf("repository output forbidden")
		}
		if p == filepath.Dir(p) {
			break
		}
	}
	switch os.Args[1] {
	case "init":
		pin, e := initRoot(target, time.Now().UTC())
		if e != nil {
			return e
		}
		fmt.Println("CANDIDATE root SHA256 (requires independent owner verification): " + pin)
		return nil
	case "rotate":
		return rotate(target)
	}
	return fmt.Errorf("offline command required")
}
func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "Offline root ceremony refused; no key material is logged")
		os.Exit(1)
	}
}
