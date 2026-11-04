# Buat Toko Online Sendiri — private control configuration

Primary authentication is passwordless email OTP through Resend. Identity, installations and revocable sessions live in dedicated control PostgreSQL, not the merchant/customer database. No OIDC provider is mandatory. Read docs/release/P0_CHATGPT_HANDOFF.md and P0_AUTH_CONFIGURATION.md for exact keys and operational gates. Missing emailAuth keeps signup/login unavailable; never enable a mock delivery transport in production.

The JSON example only supplies loopback service/private path placeholders and is not deployed. Add authMode=email_otp and emailAuth private file references after verified sender/Resend configuration. Do not place API keys, OTP pepper, signing keys or database DSN values in source/chat/CI logs. The existing environment name JETSELLER_CONTROL_CONFIG_FILE and token audiences remain compatible.

The server listens on127.0.0.1:3100. Do not proxy the dashboard domain to a storefront or reuse Gheverhan PostgreSQL. Domain/DNS/TLS/backup/rotation/deployment are separate operational workstream actions requiring the owner approval prescribed in the handoff.
