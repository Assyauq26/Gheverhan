package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"
)

// RecoveryPairing binds a fresh management identity after explicit owner revoke
// and fingerprint consent at the control plane. It is not installation preflight
// and never changes an existing paired state, key, store or Docker service.
func (c *PairingClient) RecoveryPairing(ctx context.Context, state *State) (DeviceSession, error) {
	var session DeviceSession
	if state.Journal.Phase == "PAIRED" {
		return session, ErrAlreadyPaired
	}
	var marker struct {
		Purpose        string `json:"purpose"`
		InstallationID string `json:"installation_id"`
		ControlOrigin  string `json:"control_origin"`
	}
	raw, err := state.readPrivate("management-only.json", 4096)
	if os.IsNotExist(err) {
		if state.Journal.Phase != "INITIALIZED" {
			return session, ErrManagement
		}
		marker.Purpose = "device-recovery"
		marker.InstallationID = state.Identity.InstallationID
		marker.ControlOrigin = c.origin
		if state.writePrivate("management-only.json", marker) != nil {
			return session, ErrState
		}
	} else if err != nil || decodePrivate(raw, &marker) != nil {
		return session, ErrState
	}
	if marker.Purpose != "device-recovery" || marker.InstallationID != state.Identity.InstallationID || marker.ControlOrigin != c.origin {
		return session, ErrState
	}
	if _, err = state.root.Lstat("credential.json"); err == nil {
		return session, ErrManagement
	} else if !os.IsNotExist(err) {
		return session, ErrState
	}
	if state.Journal.Phase == "INITIALIZED" {
		if raw, err = state.readPrivate("pairing.json", 8192); err == nil {
			if json.Unmarshal(raw, &session) != nil || session.ControlOrigin != c.origin {
				return session, ErrState
			}
		} else if os.IsNotExist(err) {
			payload := struct {
				InstallationID string `json:"installation_hint"`
				PublicKey      JWK    `json:"public_key"`
				Protocol       string `json:"protocol_version"`
				OS             string `json:"os"`
				Arch           string `json:"arch"`
				Version        string `json:"agent_version"`
			}{state.Identity.InstallationID, publicJWK(state.PrivateKey()), "1", "ubuntu-24.04", "amd64", "0.1.0"}
			status, e := c.request(ctx, "/agent/pairing/device", payload, &session)
			if e != nil || status != 201 || session.SessionID == "" || !secretPattern.MatchString(session.DeviceCode) || !secretPattern.MatchString(session.Nonce) || !codePattern.MatchString(session.UserCode) || session.ExpiresIn < 1 || session.ExpiresIn > 600 || session.Interval < 5 || session.Interval > 60 || session.VerificationURI != c.origin+"/hubungkan-server" {
				return DeviceSession{}, ErrManagement
			}
			session.ControlOrigin = c.origin
			session.ExpiresAt = time.Now().Add(time.Duration(session.ExpiresIn) * time.Second).UTC()
			if state.writePrivate("pairing.json", session) != nil {
				return DeviceSession{}, ErrState
			}
		} else {
			return session, ErrState
		}
		// A separate management-only marker makes clear no PREFLIGHT_OK occurred.
		state.Journal.Sequence++
		state.Journal.Phase = "PAIR_PENDING"
		state.Journal.UpdatedAt = time.Now().UTC()
		if state.writePrivate("journal.json", state.Journal) != nil {
			return session, ErrState
		}
	}
	session, err = c.Resume(state)
	if errors.Is(err, errPairingExpired) {
		return c.Start(ctx, state)
	}
	return session, err
}
