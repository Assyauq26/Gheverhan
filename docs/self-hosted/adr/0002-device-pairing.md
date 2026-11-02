# ADR-0002 — Device-bound pairing and management identity

Status: PROPOSED; recommend reviewed application PoP for MVP, pending owner/security approval.

Context: local HS256 customer JWTs are inappropriate installation credentials. RFC8628 inspiration does not establish OAuth compliance or device proof of possession by itself. FR-04 and A08–A12/A27–A28 require expiry, race and ownership handling.

Proposal: bootstrap generates a local device key; anonymous pairing initialization submits only public identity/version and installation intent. Short-lived device_code is a secret stored locally; user_code shown for explicit authenticated verified-owner consent. Bind consent to install ID/public-key fingerprint/scopes; atomic transaction consumes one code and binds exactly one owner/device. Polling requires code plus protocol-level key possession. Enforce bounded TTL, slow_down/rate limits, lockout and generic ownership errors. No secrets in URLs/logs. API idempotency key cannot override consumed ownership.

Management uses a separate short-lived scoped credential bound to the device key, with replay protection (request nonce/sequence, timestamp/expiry, method/path/body binding). Choose mTLS only with explicit issuance/rotation/revocation/clock recovery. Otherwise specify reviewed application PoP, not bespoke unreviewed cryptography. Center downtime uses bounded backoff and never gates commerce.

Recovery: unpair/revoke future commands and rotate installation credentials, not store secrets/data. Lost-device-key re-pair requires explicit seller/admin physical-host proof and audit; no silent reassignment or reuse of compromised keys.

Rejected: long-lived shared bearer/PAT, store admin cookie as agent identity, owner confirmation based solely on a user_code. Exit: security transcript review, expiry/replay, concurrent consume, cross-owner/rebinding and revoked-device tests. Display fingerprint and sanitized logs policy must be clarified in docs before implementation.

## Protocol comparison and proposed review profile

| Option | Benefit | Cost and risk | Recommendation |
|---|---|---|---|
| mTLS | Transport client identity, key stays local | Certificate issuance/renewal/revocation/clock recovery and trusted TLS termination | Alternative with a named PKI owner and lifecycle proof |
| Application PoP | Device-bound token through ordinary HTTPS termination | Replay cache, proof verification and request canonicalization remain critical | Preferred MVP proposal using established JOSE/OAuth libraries and reviewed RFC9449 profile |

[RFC9449](https://www.rfc-editor.org/rfc/rfc9449) describes DPoP, [RFC8705](https://www.rfc-editor.org/rfc/rfc8705) OAuth mTLS and [RFC8628](https://www.rfc-editor.org/rfc/rfc8628) device interaction. These references do not certify this custom pairing service as OAuth compliant.

Review profile: local asymmetric key; access token issuer/audience/install/device/scopes/expiry and key-thumbprint binding. Validate proof algorithm/signature, method/URI, issued-at, unique proof ID, server nonce and access-token hash where applicable. A bounded shared replay cache fails closed for management if unavailable. Initial code exchange requires proof by the originally submitted key; code alone cannot obtain credentials.

DPoP alone does not bind arbitrary body or query content. Typed operation authorization separately enforces exact installation scope, signed desired release and durable version/idempotency rules. Any additional body-signature mechanism needs a separately reviewed standard profile; do not label custom crypto DPoP.

Proposed parameters for review: pairing TTL 10 minutes, initial polling 5 seconds with slow-down, access lifetime 10 minutes, proof time tolerance 60 seconds plus server nonce. Set entropy/attempt/rate budgets from threat analysis. Rotation requires old-key authorization plus new-key possession and atomic swap; lost key requires seller recovery. Check revocation on every management request. Lost issuance-response retry returns only a bounded same-key/same-operation result without consuming twice. Center outage pauses management only.

Acceptance: named Go/security reviewers, versioned transcript/schema, library review, wrong-key/audience/nonce/expiry/replay, cross-owner, concurrent consume, clock, rotation/revocation and lost-response tests. No implementation or runtime proof in M0.
