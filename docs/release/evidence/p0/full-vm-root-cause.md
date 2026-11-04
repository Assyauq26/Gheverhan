# Full seller VM callback root cause

Baseline source: fdc930cabc66f0a40d10980e334894f53f4f680e. Failed run: https://github.com/Assyauq26/Gheverhan/actions/runs/41800920068 . Artifact full-synthetic-seller-vm-evidence was downloaded and examined before modifying code or rerunning.

The artifact reports register-otp-wizard, domain-intent-ownership, verified-bootstrap and actual-vm-pairing PASS. Pairing fingerprint/installation bindings match, process exits0, server session is CONSUMED and local phase PAIRED with a durable credential. The first failure is scoped-download-tuf-cosign, callback exit1, checkpoint next0/reported0. No store containers exist yet. OOM0, swap0, minimum available RAM1545756672bytes and disk34868334592bytes apply ONLY to this pre-provisioning failed run, not an installed store peak.

## Proven installer defect

FetchRelease calls GET /agent/release-download-authorization. PairingClient.InstallRequest admitted only GET /agent/install-authorization and POST /agent/install-progress. Its guard returned ErrPairing BEFORE credential/network handling, which FetchRelease converted to the fixed ErrInstall category. Thus this failure was not a rejected TUF signature or Cosign signature.

A targeted regression with a real TLS test server and real Ed25519 device proof reproduced this before the fix: required download route rejected, HTTP calls=0. With precisely that endpoint added to the narrow allowlist, all three required operations reach the authenticated TLS server. Test verifies signed method/URL/token hash/nonce/body binding, JOSE profile and rejects wrong methods, query variants and arbitrary routes without a network request. Production root-state loading, JWT/PoP handling, TLS checks, TUF, Cosign and resource thresholds remain in place.

The HTTP transport was separated from paired-root-state loading for cross-platform regression coverage. The public InstallRequest still loads and validates its paired state/credential before invoking the same private authenticated transport.

## Separate diagnostic defect

After callback already returned1, p0-vm.sh expanded an empty docker-ps result into docker inspect with no IDs. That secondary read-only command was already followed by `|| true`; it did not cause the callback failure. A separate collector now skips inspect for no containers, validates IDs and retains actual query failures. Targeted Bash tests cover empty, nonempty, malformed-ID and query-error cases without accessing any Docker daemon. Callback status still determines the VM result.

Targeted local red/green tests completed before the repair commit/full rerun. The full workflow now runs these targeted regressions before building signed fixtures and starting its monitored VM. Final full-journey status must come from the repaired exact-HEAD run, not this analysis or component tests. No production access, merge, signing-key change or deployment occurred.

## Follow-up run 41803449957: harness event loop starvation

Exact source6431c9adaf29eeae7b85703bb9a724a17e0f0d5c passed the new transport regression on Ubuntu and signed directory/ZIP verification, but the actual VM callback again failed at scoped-download-tuf-cosign (next0/reported0). Pairing passed; OOM0 and no Docker diagnostic noise. The driver used execFileSync for SSH while the same Node process hosted control-plane HTTPS. FetchRelease requests that server; the synchronous child blocks the parent event loop until the unchanged8second client timeout. This is a harness scheduling defect, distinct from the proven missing installer route.

A targeted real child-process/HTTP regression reproduces the old pattern: child times out, parent receives0requests while blocked. The asynchronous command helper passes the same request, handles stdin and bounded output/failure diagnostics. All guest SSH calls are now awaited asynchronous operations. TLS, PoP, TUF/Cosign, scope and timeout policies are unchanged. Fixed-label/status observations and journal checkpoints aid further diagnosis without recording credentials or grant URLs. No full-pass claim is made until the next exact-source artifact proves it.
