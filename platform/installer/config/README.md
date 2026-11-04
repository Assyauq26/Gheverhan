# Buat Toko Online Sendiri — control plane configuration (not deployed)

The JSON example sets the new canonical control origin and private file paths only. It intentionally omits OIDC/session issuer: authentication must remain unavailable until a real provider is configured and tested. The server listens on 127.0.0.1:3100; no public portal route is enabled by this example.

Provision a separate control database matching the existing allowlist (`jetseller_control...`), a dedicated unprivileged service user, and private 0600 runtime/config files. Do not use Gheverhan PostgreSQL. Follow runtime.mjs/validateOidc: a verified HTTPS issuer, exact same-issuer authorization/token endpoints, registered client ID, callback https://dashboard.buattokosendiri.web.id/auth/callback, pinned public JWKS and an independent session-signing key are mandatory before enabling OIDC. Retain issuer/audience compatibility and never forward old bearer/device credentials by redirect.

Existing environment name JETSELLER_CONTROL_CONFIG_FILE is retained for compatibility. No secret values belong in this example. Deployment, DNS, Caddy routing, key migration and production authentication activation require separate readiness checks and owner approval. The HTTPS/OIDC/CSRF tests use disposable providers/databases; they do not prove live seller registration.
