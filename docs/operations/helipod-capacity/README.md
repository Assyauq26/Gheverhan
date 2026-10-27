# Helipod capacity gate before PR112 deployment

## Observed audit: 27 October 2026, 21:24 WIB

Target: `43.173.21.197`, Helipod VPS `d26bcb57-667f-4e36-b1ed-d88169019ae9`, Ubuntu22.04, 2CPU/2GB RAM/40GB disk, running. [Sanitized provider evidence](provider-observation.json).

Helipod monitoring reports **94.17% disk used**, last-hour94.15–94.31%. Applying that percentage to the nominal40GB gives roughly2.33GB unoccupied, **not measured filesystem available bytes** (filesystem overhead/reserved blocks/mounts differ). Actual `statvfs`/Docker/directory measurements have NOT run. Do not claim a recovery amount or a confirmed root cause yet. Public health returned HTTP200 during this audit; its body was not collected.

Helipod VPS backup API returned `null` (provider backup not active). This does not establish whether independently managed external database/media backups exist. Their existence, freshness, off-host storage and restore evidence remain release gates. Do not enable paid backups or create a same-disk dump automatically on a nearly full filesystem.

## Access audit and evidence

- Latest main remains `f6e7fbfd24cf618e55adf9bb4d260e0a2ce6ab5f`; V4 PR112 remains OPEN/unmerged at `7b8ac21d79e681971bc5e2e5020b7159387b6c0b`. V4 CI is green; diagnostics preparation does not modify its branch.
- [Existing main deployment40452439091](https://github.com/Assyauq26/Gheverhan/actions/runs/40452439091) succeeded, including restricted SSH install, image stream and public health. This establishes the Actions deployment route worked; it does not grant an interactive diagnostics shell to this task.
- `.github/workflows/helipod-autodeploy.yml`: pinned host key, `ubuntu@43.173.21.197:22`, encrypted deploy credential. `bootstrap-autodeploy.sh` installs `command="sudo -n /usr/local/sbin/gheverhan-deploy-release"` with forwarding/TTY disabled. `deploy-release.sh` rejects a nonempty `SSH_ORIGINAL_COMMAND`; an empty SSH command enters an image-load/migrate/restart pipeline.
- **Do not probe with an empty command, repurpose/extract the deploy private key, reset passwords or add an unrestricted root SSH key.** No such action was attempted.
- Environment readiness: no SSH agent, no local SSH directory, no configured audit/deploy-key binding. The declared TCP grant list contains no VPS destination. The task's unrelated database binding was not read or used. Helipod connector offers monitoring and SSH-key management, but no guest-shell execution tool. Root-password retrieval was not requested.
- No production configuration, files, themes, database data or Docker objects were changed. No cleanup, prune, migration, merge or deployment was executed.

## Source-defined storage; live identity still needs confirmation

| Resource | Expected from current source | Protection |
|---|---|---|
| App | Compose project`deploy`, service`app`; SHA-tagged`gheverhan` image | Preserve actual running image ID and all stopped-container references |
| Rollback | Prior healthy runtime SHA; deploy script only holds`OLD_IMAGE` during a rollout | Preserve ALL runtime images until live inventory/last-good evidence confirms exact protected IDs; do not infer by tag date alone |
| PostgreSQL | `postgres:17-bookworm`, project volume normally`deploy_postgres`, mounted at`/var/lib/postgresql/data` | Never prune/delete volumes or database/WAL files; resolve actual mount from inspect metadata |
| Product/branding/private media | Bind`/opt/gheverhan/media`→`/data/media` | Preserve whole tree, including revisions/staged evidence; no file listing or deletion |
| TLS/Caddy | `caddy:2`, normally`deploy_caddy_data`/`deploy_caddy_config` | Preserve volumes/certificates and proxy image |
| Build image | `gheverhan-migrate:<SHA>` | Unused old images may become targeted candidates after approved inventory; retain needed recovery tooling |

### Root-cause hypothesis

Builds occur on GitHub runners, not normally on the VPS. Every release imports two images. Successful releases remove the migration-image tag, but **old runtime images have no retention/cleanup policy**. Failures before the final removal can retain large migration images as well. These are code-supported accumulation paths, not proof they account for the occupied bytes. Old local builds, Docker layers/cache, logs, archives, database growth, media and deleted-open files remain possibilities. `du`/filesystem differences require investigation rather than deleting database files. Image virtual sizes/shared layers must not be added together as recoverable storage.

## Prepared separate read-only mechanism (NOT installed/enabled)

Files live under`ops/helipod-capacity`, outside the existing autodeploy trigger paths. The diagnostics PR can therefore be approved/merged separately **without pushing frontend/deploy changes that trigger an app rollout**. Do not merge even this preparation without approval. A newly added dispatch workflow must first exist on the default branch; do not attempt to evade that GitHub restriction by executing unreviewed branch code with Production credentials.

The root-owned Python collector accepts only the literal`gheverhan-capacity-v1`, no arguments. It uses a fixed local Unix socket and only allowlisted Docker API GETs. It ignores Docker host/proxy environment overrides. It returns selected image IDs/tags/sizes/shared bytes/references, containers' image/health/mount metadata, volume metadata, build-cache size/in-use metadata, filesystem bytes/inodes and bounded low-priority directory totals. It omits environment/command/label/driver-option/log contents and never opens`.env` or database files for contents. `/system/df` can still impose I/O; timeout, low-priority`du`, one Actions concurrency group and an existing deployment lock limit impact. A busy/missing lock, denied command or exception fails closed without raw details. Incomplete directory scans/missing paths keep the capacity gate blocked.

Even a capacity pass is **CAPACITY_ONLY_PASS**, with`deploymentAuthorized:false`. It does not authorize deletion/migration/deployment. All volumes and all runtime images are protected. Only unused SHA-tagged migration images are automatically labeled *candidates requiring approval*. Unknown images are preserved pending review. Unique bytes are conservative metadata, not a promised cleanup result; build-cache/shared-image accounting overlaps.

### Configuration requiring approval

1. Approve this independent diagnostics change and its collector SHA256: `a403570477fa2c876dfd5bf4fd8b17d3c55e1bc5abba56d27747b3b951851959`. No V4 merge/deploy approval is implied.
2. An administrator stages the reviewed bundle and one new Ed25519 **public** key in a root-owned directory inaccessible to untrusted writers. The private counterpart belongs only in GitHub's encrypted environment secret, never in chat/source/logs. Use the prepared single installer via an already authorized administration/console channel after approval:

   `sudo bash /root/approved-capacity/install-capacity-audit.sh /root/approved-capacity/audit.pub APPROVED_COLLECTOR_SHA256`

   This is a proposed one-time batch installation, **not a command already run**. It creates the password-unset system account`gheverhan-audit`, root-owned home/authorized_keys, a forced-command-only key with OpenSSH`restrict`, and a sudoers rule for exactly the no-argument collector. No Docker-group membership, broad sudo, forwarding, arbitrary commands or change to the existing deployment key. It validates public key/checksum/sudoers and refuses existing identities/policies/symlinks. Its only allowed retained environment field is`SSH_ORIGINAL_COMMAND`; the Python interpreter runs isolated. Existing deployment lock must exist and be root-owned. Root access for installation is not currently available to this task; do not bypass the deploy restriction to install it.
3. Create GitHub environment **`production-diagnostics`**, required human reviewers (e.g.`mrifatsyauqi`), prevent self-review, deployment branch restriction`main`. Verify environment protection is available/enforced for this repository's plan; do not dispatch if it cannot be enforced.
4. Environment secret **`HELI_POD_AUDIT_KEY_B64`** (new key, never reused deploy key); environment variables **`HELI_POD_AUDIT_KNOWN_HOSTS`** (existing VPS host public-key pin verified through trusted console/out-of-band) and **`HELI_POD_AUDIT_COLLECTOR_SHA256`** (reviewed file checksum). Do not replace host verification with unauthenticated`ssh-keyscan` or`StrictHostKeyChecking=no`.
5. Dispatch **Helipod read-only capacity audit**, ref`main`, acknowledgement`READ_ONLY_CAPACITY_V1`; approve only its diagnostics environment. The workflow has`contents:read`, no checkout/downloaded code, no database/deploy secret, fixed remote account/command, numeric summary only, and a sanitized metadata artifact retained1day. Incorrect ref/acknowledgement fails before credential access; mismatched collector checksum blocks acceptance. Review artifact access because metadata reveals internal paths/image IDs even without secrets. The runner deletes temporary SSH credentials; raw SSH stderr is suppressed/deleted.

Once that channel is approved/configured, the audit is one Actions dispatch; the user need not execute disk/Docker commands individually. No credential extraction from existing Actions runs is needed.

## Cleanup plan after measured inventory and separate deletion approval

First record report time, exact active app/DB/proxy image IDs and all mounts, actual last-good runtime ID+SHA with health evidence, filesystem/inode free bytes, protected image IDs/volumes/paths, and each candidate's ownership/reference count. Audit report may require additional owner review for unknown images; zero references alone is not permission to delete it.

| Order | Candidate | Conditions before approval | Recoverable capacity now |
|---|---|---|---|
|1|Unused old migration images|Exact ID/SHA list, zero references across all containers; no recovery tooling requirement; recheck immediately before deletion|Unknown until inventory; use unique bytes as conservative guidance, then actual filesystem delta|
|2|Unused build cache from confirmed local builders|Builder/cache IDs, not in use, no concurrent build/deploy, owner agrees to rebuild cost|Unknown; do not double-count shared image layers|
|3|Superseded runtime images beyond required last-good set|Confirm current+last healthy rollback by ID, archive/rebuild source proven, explicit per-ID approval|Unknown; collector protects these by default|
|4|Known obsolete release archives or package downloads|Measured exact paths, ownership/purpose/date established, not backup/media/config/source-in-use|Unknown; directory size alone is insufficient|
|5|Excess retained journals/logs|Measured retention/log-rotation issue; approve bounded retention adjustment separately; no raw logs exposed|Unknown; no automatic truncate/vacuum|

Never run`docker system prune`, volume prune,`docker compose down -v`, database maintenance/deletion, or recursive deletion under Docker storage/media. Do not remove container files or rotated logs by hand. Never delete bind media, PostgreSQL data/WAL, Caddy certificate volumes, active/stopped container dependencies or the last-good app image. No executable cleanup workflow or broad prune action is introduced here.

For any approved image batch, use explicit reviewed image IDs with non-force`docker image rm <APPROVED_ID...>` only after refreshing inventory under the deployment lock; Docker must refuse a referenced image. Do not execute this template before approval. Reclaim incrementally, rerun the same read-only workflow after each batch, and stop once the target/reserves are met. If protected resources dominate capacity or safely reclaimable storage is insufficient, propose a priced disk upgrade/off-host archival with separate approval rather than deleting essential data.

## Capacity, verification and release gates

- Target **at least10GiB available**, with8GiB only a separately reviewed lower bound, on the actual Docker/app/DB filesystems; provider percentages alone never pass. The prepared collector conservatively requires10GiB on every observed protected filesystem. Image import peak (runtime+migration unique layers plus extraction overhead), DB growth/migration temporary reserve and rollback retention must ALSO fit;10GiB is not an unconditional guarantee.
- Before cleanup: prove current health, record active IDs/mounts and confirm external PostgreSQL+media backups/restore evidence. Do not make a large local dump on a nearly full disk. No real cleanup amount can currently be promised; **8–10GB recovered/free has not been achieved**.
- After each approved batch: new read-only report with full scans, changed free bytes/inodes, retained image IDs, unchanged PostgreSQL/media/proxy mounts and running/healthy states. Compare IDs/mounts before/after; verify public health200. Compare independently generated backup manifests if available; collector intentionally does not read customer data/files. Check I/O/CPU and ensure no unexpected service restart. If totals disagree, halt and inspect deleted-open files via an independently approved bounded metadata check; don't blindly prune.
- Before V4 release: current PR112 CI/review and exact approved SHA; dedicated release approval; verified additive migration checksum/short lock timeout; tested rollback strategy that preserves verified-review security; current source storage/preflight gates; confirmed space for imported images and growth; external DB/media recovery evidence. **Merging PR112 triggers existing main autodeploy and database migration**, so it must be treated as the production release action, not a harmless merge step.
- Keep PR112 OPEN until gates and explicit merge/deploy approval. Do not dispatch the existing autodeploy workflow for diagnostics.

## Verification of prepared mechanism

`python3 -I -m unittest discover -s ops/helipod-capacity/tests -v`:21 tests PASS locally (synthetic daemon metadata only). Tests cover endpoint allowlist/GET/response bounds, invocation denial before lock access, privacy projection against synthetic secrets, protected runtime/DB/proxy/stopped images, unknown/shared-size accounting, low-priority bounded scans, incomplete/low-space/missing-media gates, busy read-only deployment lock, workflow credential separation/ref denial, autodeploy path isolation and installer syntax/invalid invocation. Both workflow YAML files parse locally. Neither installation nor forced command was run on Production. The separate offline CI workflow exercises these without environment credentials. This task intentionally does not re-run V4 browser/DB suites because neither application code nor its reviewed SHA changed.

Approval is needed for the concrete one-time identity/environment installation above because it changes Production SSH/sudo configuration; the user explicitly prohibited configuration changes without approval. Cleanup and V4 release require later, separate approvals based on measured results.
