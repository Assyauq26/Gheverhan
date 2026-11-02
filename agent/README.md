# JetSeller verified installer foundation

Status: IMPLEMENTED_PENDING_CI. This is a local Go CLI foundation, not a public installer release, installed agent daemon or completed store provisioning flow. No functional public one-line command is published. No artifact execution, package installation, Compose apply, DNS mutation, host shell endpoint or privileged helper exists in this slice.

## Implemented commands

- `preflight`: Ubuntu24.04 amd64, proposed 2 CPU / 4GiB RAM / 40GiB free disk / inode checks, IPv4 ingress-port conflict check and local existing-service refusal. Only local fixed-argument Docker container inventory is inspected when its local Unix socket exists; inherited remote Docker contexts are ignored. No service is stopped. These minimums remain unbenchmarked product proposals; passing does not prove DNS/TLS or runtime readiness.
- `pair` / `resume-pairing`: explicit existing installation intent UUID; private local state and one-operation flock; persistent Ed25519 identity; durable atomic journal with allowed forward transitions. Outbound HTTPS uses bounded HTTP timeouts, bounded strict JSON, no redirects, seller-confirmed device code and a fixed EdDSA pairing proof. Resume pins the pending code to the original control origin. Poll uses a new UUID proof ID, nonce, SHA256 code binding and 60-second expiry. Credentials must match installation/key/scopes and expire within ten minutes; they are stored locally with private permissions. Only human code, portal URI and public fingerprint are displayed for local operator confirmation.
- `verify-artifact`: require pretrusted absolute Cosign path and independently approved SHA256, exact signer identity/issuer, expected artifact digest and Sigstore bundle. Bounded private snapshots prevent artifact/verifier path replacement between digest and verification. A fixed argv calls Cosign; output/errors are redacted and the artifact is never executed. Missing trust/tool, digest mismatch, invalid bundle, tampering or wrong signer fail closed. Cosign validates bundle verification material; it may retrieve its standard validated Sigstore root metadata. The `--offline` flag concerns bundle/transparency verification and is not a claim that fresh root discovery has no network dependency.

State parent directory must already exist. The state directory is private, symlink roots/ancestors are refused, identity/journal/credentials use mode0600, atomic replacement and file/directory fsync. Non-Linux CLI state operations fail closed. Existing identity conflicts and concurrent processes are refused; retry does not create a second installation or erase a store. The tool creates its own identity state only, never a store volume or administrator.

## Pairing protocol coordination

Targets `/api/installer/v1/agent/pairing/device` and `/agent/pairing/token` on the explicitly selected HTTPS origin. Initial request contains installation UUID/public Ed25519 JWK/profile/version, never SSH or store credentials. Proof header is alg EdDSA / typ jetseller-pairing+jwt; claims are audience, operation pairing-token, session nonce, lowercase hex SHA256(device_code), fresh UUID jti, iat and exp. Token response uses jetseller-pop and public_key_thumbprint. This is an explicitly scoped pairing transcript, not complete RFC8628/OAuth or RFC9449 DPoP compliance. The isolated control-plane backend implements ownership/consent/single-use/replay enforcement in its own PR; Go TLS fixtures alone do not prove that backend.

## Verification

Go formatting, vet, portable unit tests and Linux cross-build are local checks. Ubuntu CI executes race-enabled Linux state/concurrency/resume and TLS pairing fixtures. The dedicated integration test uses the actual Cosign v3.1.4 signed upstream checksum bundle, pinned binary/artifact/bundle hashes, exact public signer and issuer, then rejects modified bytes even with their matching SHA256 and rejects a wrong signer. This is real upstream signature validation, not a mocked verifier or a JetSeller release-signing proof.

Local Windows result: six portable tests PASS; two Linux-only fixtures skipped; actual upstream Cosign signed/tamper/wrong-signer integration PASS. Linux workflow results are reported on the PR. No live VPS, production secret, database, DNS or deployment access is involved.

## Remaining release gates

Independent initial verifier/root distribution, approved signing custody and key recovery, TUF target freshness/anti-rollback and recovery, installation-scoped registry grants, final protocol specialist review and rotation/revocation, full Ubuntu server conflict/network/time preflight, constrained privileged helper, DNS/HTTPS orchestration, durable package/DB/app installation and first-run local admin are not implemented here. The CLI deliberately has no install/execute fallback until those gates exist. A verified blob is not an approved fresh compatible store release.

Requirements: FR-02/03/04, NFR-03/04/05; partial A03-A12/A21/A28 groundwork only. Store Installed is not Store Ready to Sell. Rollback: remove this optional CLI/tooling; preserve private state and all seller data. No production rollout or public release is authorized by this branch.

References: [Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/), [Go os.Root](https://pkg.go.dev/os#Root), [RFC8628](https://www.rfc-editor.org/rfc/rfc8628), [RFC9449](https://www.rfc-editor.org/rfc/rfc9449).
