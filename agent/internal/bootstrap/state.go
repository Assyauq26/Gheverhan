package bootstrap

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var ErrState = errors.New("local state unavailable or identity conflict")
var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Identity struct {
	InstallationID string `json:"installation_id"`
	Seed           string `json:"seed"`
}
type Journal struct {
	Version        int       `json:"version"`
	InstallationID string    `json:"installation_id"`
	Sequence       uint64    `json:"sequence"`
	Phase          string    `json:"phase"`
	UpdatedAt      time.Time `json:"updated_at"`
}
type State struct {
	root     *os.Root
	lock     *os.File
	Identity Identity
	Journal  Journal
}

func OpenState(directory, installationID string) (*State, error) {
	if !uuidPattern.MatchString(installationID) || !filepath.IsAbs(directory) || filepath.Clean(directory) != directory {
		return nil, ErrState
	}
	if err := os.Mkdir(directory, 0700); err != nil && !os.IsExist(err) {
		return nil, ErrState
	}
	// Reject symlinked roots and ancestors; private directory required.
	current := directory
	for {
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return nil, ErrState
		}
		if current == directory && info.Mode().Perm()&0077 != 0 {
			return nil, ErrState
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, ErrState
	}
	fail := func() (*State, error) { root.Close(); return nil, ErrState }
	if info, checkErr := root.Lstat("operation.lock"); checkErr == nil {
		if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
			return fail()
		}
	} else if !os.IsNotExist(checkErr) {
		return fail()
	}
	lock, err := root.OpenFile("operation.lock", os.O_RDWR|os.O_CREATE, 0600)
	if err != nil {
		return fail()
	}
	if err = lockFile(lock); err != nil {
		lock.Close()
		return fail()
	}
	s := &State{root: root, lock: lock}
	success := false
	defer func() {
		if !success {
			s.Close()
		}
	}()
	if raw, err := s.readPrivate("identity.json", 4096); err == nil {
		if json.Unmarshal(raw, &s.Identity) != nil || s.Identity.InstallationID != installationID {
			return nil, ErrState
		}
		seed, err := base64.RawURLEncoding.DecodeString(s.Identity.Seed)
		if err != nil || len(seed) != ed25519.SeedSize {
			return nil, ErrState
		}
	} else if os.IsNotExist(err) {
		// Missing key on an existing installation is recovery, never a new key.
		for _, name := range []string{"journal.json", "pairing.json", "credential.json"} {
			if _, checkErr := root.Lstat(name); checkErr == nil || !os.IsNotExist(checkErr) {
				return nil, ErrState
			}
		}
		_, key, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, ErrState
		}
		s.Identity = Identity{installationID, base64.RawURLEncoding.EncodeToString(key.Seed())}
		if err = s.writePrivate("identity.json", s.Identity); err != nil {
			return nil, ErrState
		}
	} else {
		return nil, ErrState
	}
	if raw, err := s.readPrivate("journal.json", 4096); err == nil {
		if json.Unmarshal(raw, &s.Journal) != nil || s.Journal.Version != 1 || s.Journal.InstallationID != installationID {
			return nil, ErrState
		}
	} else if os.IsNotExist(err) {
		s.Journal = Journal{Version: 1, InstallationID: installationID}
		if s.Record("INITIALIZED") != nil {
			return nil, ErrState
		}
	} else {
		return nil, ErrState
	}
	success = true
	return s, nil
}
func (s *State) Close() error {
	if s.lock != nil {
		unlockFile(s.lock)
		s.lock.Close()
	}
	return s.root.Close()
}
func (s *State) PrivateKey() ed25519.PrivateKey {
	seed, _ := base64.RawURLEncoding.DecodeString(s.Identity.Seed)
	return ed25519.NewKeyFromSeed(seed)
}
func (s *State) Record(phase string) error {
	allowed := map[string]string{"INITIALIZED": "PREFLIGHT_OK", "PREFLIGHT_OK": "PAIR_PENDING", "PAIR_PENDING": "PAIRED"}
	if !(s.Journal.Phase == "" && phase == "INITIALIZED") && allowed[s.Journal.Phase] != phase {
		return ErrState
	}

	s.Journal.Sequence++
	s.Journal.Phase = phase
	s.Journal.UpdatedAt = time.Now().UTC()
	return s.writePrivate("journal.json", s.Journal)
}
func (s *State) readPrivate(name string, max int64) ([]byte, error) {
	info, err := s.root.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > max {
		return nil, ErrState
	}
	f, err := s.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, max+1))
}
func (s *State) writePrivate(name string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return ErrState
	}
	suffix := make([]byte, 12)
	if _, err = rand.Read(suffix); err != nil {
		return ErrState
	}
	temp := ".pending-" + base64.RawURLEncoding.EncodeToString(suffix)
	f, err := s.root.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return ErrState
	}
	defer s.root.Remove(temp)
	if _, err = f.Write(append(raw, '\n')); err != nil {
		f.Close()
		return ErrState
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return ErrState
	}
	if err = f.Close(); err != nil {
		return ErrState
	}
	if err = s.root.Rename(temp, name); err != nil {
		return ErrState
	}
	dir, err := s.root.Open(".")
	if err != nil {
		return ErrState
	}
	defer dir.Close()
	if err = dir.Sync(); err != nil {
		return ErrState
	}
	return nil
}
