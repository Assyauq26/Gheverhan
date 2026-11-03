# Domain ownership review branch

Seller-scoped, CSRF-protected DNS TXT challenges are durable in the independent installer database. Challenges expire after 30 minutes; exact TXT matches record an observation timestamp without changing installation, HTTPS or commerce readiness. Creating a replacement invalidates earlier unverified proofs. Verification rechecks ownership and the current challenge under database locks after bounded DNS lookup.

Local Node 22 verification: 16 backend, DNS-loopback and dashboard contract tests passed. PostgreSQL concurrency and HTTPS browser scenarios are included in disposable CI; results must be checked on this PR before approval. The browser DNS resolver is injected; the separate UDP fixture exercises real Node DNS parsing. Neither is public DNS or public HTTPS evidence.

No registrar changes, host reboot, production migration or deployment. Public HTTPS and host reboot remain PENDING_DISPOSABLE_VPS. Production signing custody, private release distribution and durable agent renewal remain separate open implementation/review gates.
