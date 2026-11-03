# M1 disposable runtime evidence — 2026-11-02

Status: RUNTIME_VALIDATED in CI; PRs remain open and unmerged. Not PILOT_READY or RELEASE_READY. Owner explicitly permits Ubuntu CI Docker/PostgreSQL/Caddy/readiness/persistence tests and continued installer/pairing/dashboard work. Only host reboot and public HTTPS are deferred as PENDING_DISPOSABLE_VPS. Existing Gheverhan VPS is excluded.

## Verified evidence

- Packaging #143: [runtime run 41451443851](https://github.com/Assyauq26/Gheverhan/actions/runs/41451443851), head `fcf8b2ad07f7e8b2e0ccaa74ff737ea20a40ed68`: production image/build, separate migration/bootstrap/runtime roles, runtime CRUD and denied schema/role/ledger writes, private DB ports, runtime-only secret mount, home/admin, internal-CA hostname/chain verification, DB/media restart persistence and secret sentinel scan over exported image layers PASS.
- Readiness #144: [runtime run 41451213316](https://github.com/Assyauq26/Gheverhan/actions/runs/41451213316), head `39e0812b` before subsequent parent-only rebase: actual readiness200, stopped database readiness503 with liveness200, recovered database readiness200 PASS. Linux FIFO marker regression is covered by the unit suite. Latest exact-HEAD checks remain independently inspectable in the PR.
- Recovery #145: [runtime run 41451257236](https://github.com/Assyauq26/Gheverhan/actions/runs/41451257236), head `8e8933ca` before subsequent parent-only rebase: 11 Linux recovery tests PASS; app quiesced, DB/media/recovery configuration snapshot encrypted with AES256GCM, restored into a fresh independent PostgreSQL container/volume, synthetic records and all file checksums matched. Source retained; destination stopped only.

The original failed CI runs exposed Compose tmpfs parsing, launcher directory permissions and missing image assets. Those were fixed, not waived. Review findings for source coverage route omission, FIFO media identity blocking and multi-megabyte base64 regex stack exhaustion have regression tests and fixes. Each dependent branch is rebased to reviewed parent changes; no dependency merge is implied.

## Measured limits

Recovery fixture had 9 files / 109,076 plaintext bytes; encrypted archive 146,690 bytes; encryption reported 10ms and decrypted file restore 16ms. These timings exclude PostgreSQL initialization/import and are not a production RTO. The executable harness additionally reports full fixture restore/import and startup seconds and per-container resource usage on subsequent runs.

Observed uncompressed app image: 1,121,121,114 bytes in recovery run above (digest/build-specific). Runner reported 15,983MiB total RAM and 81GiB free disk at the sampled point; this is runner capacity, not application memory consumption or minimum seller sizing. Do not infer a validated 2vCPU/4GiB/40GiB minimum. Peak build/import/backup disk, representative load and seller-scale restore remain measurement gates.

## Remaining gates

- PENDING_DISPOSABLE_VPS: actual Ubuntu VPS reboot and public DNS/ownership/ACME HTTPS verification. Internal fixture CA success is not public certificate evidence.
- Signed artifact custody, independent bootstrap trust/TUF freshness, installation-scoped private pulls and revocation/freeze proof remain security/delivery gates.
- Installer provisioning/resume, local first-admin claim, complete portal/OIDC/agent flow, seller update policy and compatible rollback need their own end-to-end evidence.
- Off-server backup destination/key recovery, RPO/RTO/retention and restored-browser commerce flows remain open. Same-runner separate-volume restore is not off-server durability.
- Existing commerce regression/CI results must be checked on the exact final PR HEAD. No production deployment, database, DNS, credentials, repository visibility or CI safeguard was changed.

M1-01 is merged; subsequent PRs are reviewable implementations. No public one-liner, working seller installation, automatic update readiness or ready-to-sell state is claimed by these tests.
