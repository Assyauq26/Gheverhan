# Cross-process installer pairing fixture

This integration branch combines the reviewed Go installer foundation (#147)
and independent control-plane/dashboard (#146/#148) without merging any PR to
main. Its dedicated Ubuntu24.04 CI exercises the actual Go CLI, not a replacement
client or a fabricated successful pairing response.

The test builds the CLI, checks a real upstream Sigstore bundle with pinned
Cosign and exact signer identity, then starts the CLI in a digest-pinned fresh
Ubuntu24.04 container. The container has no host Docker socket or inherited
PostgreSQL/Caddy filesystem, so normal host eligibility checks execute without
a test bypass. Only its fixture network namespace is shared to reach synthetic
loopback HTTPS services; no live server or public DNS is used.

A real synthetic HTTPS OIDC provider issues the browser's code/PKCE result;
the independent PostgreSQL registry creates a seller-owned intent. The CLI's
terminal verification URI and human code drive the real browser confirmation.
The CLI polls with its generated Ed25519 identity and persists the returned
credential and PAIRED journal. Tests verify the server signature/key binding,
private state permissions, one active device, no credential or device-code
leak to the DOM, and a real CLI restart retaining the same historical binding.

Human terminal output and private state are held only inside the disposable
test workspace; neither is uploaded as an artifact. Cleanup stops only containers
with matching fixture labels and retains volumes for runner disposal; it never
prunes unrelated data.

The upstream signature fixture is not proof of JetSeller release custody, TUF
freshness, installer distribution or safe store provisioning. This test performs
no store deployment or application update. Credential renewal/rotation/heartbeat
are separate gates. VPS reboot and public DNS/ACME HTTPS remain
PENDING_DISPOSABLE_VPS, and no pilot/public release readiness is inferred.
