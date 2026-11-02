# ADR-0003 — Unprivileged outbound agent, constrained local helper

Status: PROPOSED. Context: Docker socket/group grants host-root-equivalent power. Center commands must not become remote shell access. FR-07, FR-09, SECURITY_AND_RELEASES apply.

Proposal: Go static agent under a dedicated non-root service account uses outbound HTTPS and private local state directory. No listening public port, no Docker socket in agent or Next. A separately installed privileged helper exposes only a private Unix socket with OS peer UID authorization and fixed versioned operations (preflight, verified install/update, local health, approved backup). Protocol has bounded structured payloads, explicit install ID and signed release digest, local lock/journal and deadlines. Never accept arbitrary executable, command string, environment, path, mount, host network or Docker argument.

Helper independently verifies artifacts, authorized operation, local policy, disk/memory/backup and schema gates. Agent or center cannot bypass them. Install root paths are canonicalized under an installation-owned root with traversal/symlink defense; secrets never returned in result. Validate service account, filesystem ownership and IPC permissions, not just JSON schema.

Alternative: narrowly scoped sudo commands with no user-controlled args may be evaluated, but generic sudo shell/docker is rejected. Privileged helper increases implementation complexity and local attack surface; require abuse/fuzz tests and recovery of interrupted operations before acceptance. Root/system changes are confined to reviewed fresh-host bootstrap, not M0 or existing production.
