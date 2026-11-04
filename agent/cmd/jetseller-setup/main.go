package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/Assyauq26/Gheverhan/agent/internal/bootstrap"
	"github.com/Assyauq26/Gheverhan/agent/internal/installer"
	"os"
	"os/signal"
	"path/filepath"
	"time"
)

func main() {
	if err := run(); err != nil {
		// Only fixed error categories reach stderr; network errors may contain
		// credentials, pairing codes or callback URLs and must never be printed.
		category := "operation_failed"
		switch {
		case errors.Is(err, bootstrap.ErrPreflight):
			category = "host_preflight"
		case errors.Is(err, installer.ErrHTTPSPending):
			category = "https_pending"
		case errors.Is(err, bootstrap.ErrState):
			category = "private_state"
		}
		fmt.Fprintf(os.Stderr, "Penyiapan Buat Toko Online Sendiri dihentikan (%s). Data instalasi dipertahankan; periksa status sebelum melanjutkan.\n", category)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) < 2 {
		return fmt.Errorf("command required")
	}
	flags := flag.NewFlagSet("jetseller-setup", flag.ContinueOnError)
	receiptFile := flags.String("receipt", "", "new root-private verification receipt file")
	profile := flags.String("profile", "legacy-4-40", "explicit resource profile: legacy-4-40 or p0-2-2-40")
	policyFile := flags.String("policy", "/etc/buattokosendiri/release-policy.json", "independently trusted root-private release policy")
	releaseDirectory := flags.String("release-directory", "/var/lib/jetseller-agent/release", "root-owned signed release package")
	confirmation := flags.String("confirm-install", "", "confirm canonical installation UUID before local provisioning")
	directory := flags.String("state", "/var/lib/jetseller-agent", "private local state directory (parent must exist)")
	installation := flags.String("installation-id", "", "existing seller installation intent UUID")
	origin := flags.String("control-origin", "https://dashboard.buattokosendiri.web.id", "HTTPS control origin")
	artifact := flags.String("artifact", "", "local artifact path")
	bundle := flags.String("bundle", "", "local Sigstore bundle")
	digest := flags.String("sha256", "", "approved artifact SHA256")
	verifier := flags.String("cosign", "", "pretrusted absolute Cosign path")
	verifierHash := flags.String("cosign-sha256", "", "independently approved Cosign SHA256")
	identity := flags.String("signer-identity", "", "exact authorized certificate identity")
	issuer := flags.String("signer-issuer", "", "exact authorized OIDC issuer")
	if flags.Parse(os.Args[2:]) != nil || flags.NArg() != 0 {
		return fmt.Errorf("invalid arguments")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	if os.Args[1] == "verify-release-archive" {
		if err := installer.VerifyReleaseArchive(ctx, *policyFile, *artifact, *receiptFile); err != nil {
			return err
		}
		fmt.Println("ZIP rilis dan seluruh signature terverifikasi; receipt privat tersimpan. Tidak menjalankan instalasi.")
		return nil
	}
	if os.Args[1] == "verify-release" {
		if err := installer.VerifyPackage(ctx, *policyFile, *releaseDirectory, *receiptFile); err != nil {
			return err
		}
		fmt.Println("Metadata dan signature arsip rilis terverifikasi; receipt privat tersimpan. Tidak menjalankan instalasi.")
		return nil
	}
	if os.Args[1] == "install" || os.Args[1] == "activate-admin" || os.Args[1] == "fetch-release" {
		if *confirmation != *installation {
			return fmt.Errorf("installation confirmation required")
		}
		state, err := bootstrap.OpenState(*directory, *installation)
		if err != nil {
			return err
		}
		defer state.Close()
		if os.Args[1] == "fetch-release" {
			if err = installer.FetchRelease(ctx, installer.Options{State: state, StateDirectory: *directory, PolicyFile: *policyFile, ReleaseDirectory: *releaseDirectory, ControlOrigin: *origin, Confirmation: *confirmation}); err != nil {
				return err
			}
			fmt.Println("Paket rilis tersimpan setelah verifikasi TUF dan signature. Belum menjalankan instalasi.")
			return nil
		}
		if os.Args[1] == "activate-admin" {
			if err = installer.ActivateAdmin(ctx, state, *directory, *confirmation); err != nil {
				return err
			}
			fmt.Println("Kode aktivasi admin tersimpan pada file privat local-admin-claim.json di direktori state VPS. Kode tidak dikirim ke platform.")
			return nil
		}
		if err = installer.Install(ctx, installer.Options{State: state, StateDirectory: *directory, PolicyFile: *policyFile, ReleaseDirectory: *releaseDirectory, ControlOrigin: *origin, Confirmation: *confirmation}); err != nil {
			return err
		}
		fmt.Println("Readiness lokal dan TLS server terverifikasi. Jalankan activate-admin untuk mengaktifkan dashboard toko. Produk dan kesiapan transaksi belum diverifikasi.")
		return nil
	}
	if os.Args[1] == "verify-artifact" {
		err := bootstrap.VerifyArtifact(ctx, bootstrap.VerifyPolicy{VerifierPath: *verifier, VerifierSHA256: *verifierHash, CertificateIdentity: *identity, OIDCIssuer: *issuer}, *artifact, *bundle, *digest)
		if err != nil {
			return err
		}
		fmt.Println("Artifact signature and digest verified. Not executed; release freshness and install gates remain closed.")
		return nil
	}
	if os.Args[1] != "preflight" && os.Args[1] != "pair" && os.Args[1] != "resume-pairing" && os.Args[1] != "renew-credential" {
		return fmt.Errorf("unsupported command")
	}
	if os.Args[1] == "renew-credential" {
		// Renewal is not an installer. Refuse absent/incomplete state before
		// OpenState can initialize a fresh device identity or journal.
		for _, name := range []string{"identity.json", "journal.json", "credential.json"} {
			info, err := os.Lstat(filepath.Join(*directory, name))
			if err != nil || !info.Mode().IsRegular() {
				return fmt.Errorf("existing paired device state required")
			}
		}
	}
	state, err := bootstrap.OpenState(*directory, *installation)
	if err != nil {
		return err
	}
	defer state.Close()
	if os.Args[1] == "renew-credential" {
		// Renewal is only for an already-paired device with a still-valid token.
		// It must not modify preflight, pairing, journal or deploy anything.
		client, err := bootstrap.NewPairingClient(*origin)
		if err != nil {
			return err
		}
		refreshed, err := client.Renew(ctx, state)
		if err != nil {
			return err
		}
		// Never print the renewed bearer token, device key, or nonce.
		return json.NewEncoder(os.Stdout).Encode(struct {
			Status              string `json:"status"`
			CredentialExpiresAt string `json:"credential_expires_at"`
		}{Status: "renewed", CredentialExpiresAt: refreshed.ExpiresAt})
	}
	var facts bootstrap.HostFacts
	if *profile == "p0-2-2-40" {
		var p0 bootstrap.P0HostFacts
		p0, err = bootstrap.InspectP0Host(*directory, bootstrap.DefaultP0DiskBudget())
		facts = p0.HostFacts
	} else if *profile == "legacy-4-40" {
		facts, err = bootstrap.InspectHost(*directory)
	} else {
		return fmt.Errorf("unsupported resource profile")
	}
	if err != nil {
		if errors.Is(err, bootstrap.ErrPreflight) {
			// Public host facts only, never environment variables or private state.
			fmt.Fprintf(os.Stderr, "preflight: os=%s arch=%s release=%s cpus=%d memory_bytes=%d free_bytes=%d free_inodes=%d ports_available=%t existing_services=%t\n", facts.OS, facts.Arch, facts.Release, facts.CPUs, facts.MemoryBytes, facts.FreeBytes, facts.FreeInodes, facts.PortsAvailable, facts.ExistingServices)
		}
		return err
	}
	if state.Journal.Phase == "INITIALIZED" {
		if err = state.Record("PREFLIGHT_OK"); err != nil {
			return err
		}
	}
	if os.Args[1] == "preflight" {
		return json.NewEncoder(os.Stdout).Encode(struct {
			Status string              `json:"status"`
			Host   bootstrap.HostFacts `json:"host"`
		}{"preflight_ok", facts})
	}
	client, err := bootstrap.NewPairingClient(*origin)
	if err != nil {
		return err
	}
	var session bootstrap.DeviceSession
	if os.Args[1] == "resume-pairing" {
		session, err = client.Resume(state)
	} else {
		session, err = client.Start(ctx, state)
	}
	if errors.Is(err, bootstrap.ErrAlreadyPaired) {
		fmt.Println("Device binding recorded locally; credential refresh may be required. No store deployment performed.")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Printf("Open %s and enter %s. Confirm device fingerprint %s.\n", session.VerificationURI, session.UserCode, bootstrap.Thumbprint(state.PrivateKey()))
	interval := time.Duration(session.Interval) * time.Second
	for time.Now().Before(session.ExpiresAt) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
		paired, err := client.Poll(ctx, state, session)
		if err != nil {
			return err
		}
		if paired {
			fmt.Println("Device paired; local store deployment remains gated.")
			return nil
		}
		if interval < 60*time.Second {
			interval += 5 * time.Second
		}
		if client.RetryAfter() > interval {
			interval = client.RetryAfter()
		}
	}
	return fmt.Errorf("pairing expired")
}
