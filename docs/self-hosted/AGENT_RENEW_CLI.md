# JetSeller agent: one-shot credential renewal CLI

**Status: REVIEW/CI ONLY.** This is not a production daemon, systemd timer, release updater, offline recovery or approved server installation.

The `jetseller-setup renew-credential` subcommand uses the existing private installation state. It opens the same mutually exclusive state lock as pairing, requires a journal in `PAIRED` phase, and calls the bounded Go `PairingClient.Renew` which:
- requires a **currently valid** existing ten-minute agent credential;
- signs a fresh DPoP-like Ed25519 proof over the exact HTTPS POST URL, old token hash, stored nonce and new jti;
- accepts only a response bound to the existing installation, device key thumbprint, device ID, original scopes and nonce;
- writes the replacement credential atomically under the private state directory;
- prints only `status` and `credential_expires_at`, never access token, device key, or challenge.

Conceptual invocation (only on an explicitly authorized disposable or reviewed seller VPS, **not** on Gheverhan production):

```bash
jetseller-setup renew-credential \
  --state /var/lib/jetseller-agent \
  --installation-id '<seller-UUIDv4>' \
  --control-origin 'https://<actual-verified-control-origin>'
```

This command **does not** run the installer host preflight, mutate Docker, change the device pairing state, or enable checkout. An unpaired device, expired credential, incorrect control origin, revoked device, wrong device proof or unavailable control plane must fail closed. For preflight safety, the CLI does not create long-lived recovery tokens.

## Remaining work (do not claim production-ready)

1. Implement an opt-in scheduler/service with concurrency lock, expiry-aware retry/backoff/jitter, monitoring and explicit owner control; avoid a background process on tiny/production VPS without approval.
2. Design an independently reviewed expired/offline token recovery, key rotation and replacement protocol with seller authorization.
3. Assess update/registry bearer-token separation, signer custody, audit/alerting and full negative integration tests on disposable Ubuntu.
4. The full production-profile installer, private registry, DNS and signed release rollout remain separately gated.

## CI

The one-shot CLI and its no-pairing negative test are included in the Go installer foundation workflow. API and Go client renewal are separately under review in #163 and combined review PR #164. All exact-HEAD CI checks on this branch must pass before integrating with the RC branch.
