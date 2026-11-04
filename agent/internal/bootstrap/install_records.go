package bootstrap

import (
	"encoding/json"
	"os"
	"time"
)

// Fixed records only: callers cannot turn the privileged state API into an
// arbitrary path write. OpenState holds the process lock and fsyncs writes.
type InstallRecord string

const (
	ReleaseTrustRecord   InstallRecord = "install-release-trust.json"
	InstallJournalRecord InstallRecord = "install-journal.json"
	InstallSecretsRecord InstallRecord = "install-secrets.json"
	AdminClaimRecord     InstallRecord = "local-admin-claim.json"
)

func validInstallRecord(k InstallRecord) bool {
	return k == InstallSecretsRecord || k == ReleaseTrustRecord || k == InstallJournalRecord || k == AdminClaimRecord
}
func (s *State) ReadInstallRecord(k InstallRecord, out any) error {
	if ValidateInstallState(s) != nil || !validInstallRecord(k) {
		return ErrState
	}
	raw, err := s.readPrivate(string(k), 65536)
	if err != nil {
		return err
	}
	if json.Unmarshal(raw, out) != nil {
		return ErrState
	}
	return nil
}
func (s *State) WriteInstallRecord(k InstallRecord, value any) error {
	if ValidateInstallState(s) != nil || !validInstallRecord(k) {
		return ErrState
	}
	raw, e := json.Marshal(value)
	if e != nil || len(raw) > 65536 {
		return ErrState
	}
	return s.writePrivate(string(k), value)
}
func (s *State) PairedCredential() (Credential, error) {
	var c Credential
	if ValidateInstallState(s) != nil || s.Journal.Phase != "PAIRED" {
		return c, ErrPairing
	}
	raw, e := s.readPrivate("credential.json", 16384)
	if e != nil || json.Unmarshal(raw, &c) != nil || c.InstallationID != s.Identity.InstallationID || c.Thumbprint != Thumbprint(s.PrivateKey()) || c.DeviceID == "" || c.ManagementNonce == "" {
		return Credential{}, ErrPairing
	}
	expiry, e := time.Parse(time.RFC3339, c.ExpiresAt)
	if e != nil || !expiry.After(time.Now()) {
		return Credential{}, ErrPairing
	}
	return c, nil
}
func IsMissingInstallRecord(err error) bool { return os.IsNotExist(err) }
