# P0 candidate resource profile: 2 / 2 / 40

This is implementation and disposable-fixture code, not an operational change
to Tencent, Helipod, DNS, an existing Caddyfile, or a seller's server. No real VPS
was inspected or changed by this workstream.

## Contract

The separately versioned `InspectP0Host(directory, DiskBudget)` /
`ValidateP0Host(P0HostFacts, DiskBudget)` path targets Ubuntu 24.04 amd64,
two effective vCPUs, at least 2 GiB allocated/installed physical memory, and
at least 40,000,000,000 bytes of backing disk. Legacy `InspectHost` /
`ValidateHost` remain unchanged at 4 GiB / 40 GiB free. The production P0
executor must deliberately select this profile and its fixed resource template.

Linux `MemTotal` excludes firmware/kernel reservations. The profile therefore
requires **both** a physical-memory lower bound of 2 GiB and at least 1792 MiB
usable/effective memory. SMBIOS Memory Device (type 17) is used where available;
otherwise `MemTotal >= 2 GiB` is a conservative physical lower bound. It never
rounds 1.89 GiB of unknown physical RAM up to 2 GiB. A 1 GiB VM, unknown physical
capacity below 2 GiB, or a restrictive memory/cpu cgroup is rejected.

`memory.max`, `cpu.max` and effective CPU sets are checked through the cgroup-v2
hierarchy. A host with large physical memory but a 1 GiB container quota is not
accepted as an adequate installer environment. SMBIOS is guest-visible capacity
evidence, not cryptographic hardware attestation.

The backing block-device capacity distinguishes a marketed 40 GB disk from a
formatted filesystem's smaller usable capacity. A filesystem capacity is only
used as a lower bound when the backing device cannot be identified. Free space
is measured at the actual state/installation filesystem. Unknown or impossible
capacity facts, fewer than 10,000 free inodes, unavailable TCP 80/443, existing
Docker containers or existing PostgreSQL/Caddy directories still fail closed.

## Disk budget

| Reservation | Conservative initial floor |
|---|---:|
| Downloaded immutable images/archives | 2 GiB |
| Expanded current release | 4 GiB |
| Complete next download + expanded release | 6 GiB |
| Initial database data | 4 GiB |
| Initial media data | 4 GiB |
| Safety reserve | 4 GiB |
| **Required free at initial preflight** | **24 GiB** |

Signed release measurements must raise image reservations when needed. The
validator rejects a budget that hides the safety/database/media floors, omits
an entire update copy, or overflows an integer. The table is capacity planning,
not a promise of unlimited database/media capacity or a hard filesystem quota.
Runtime disk monitoring and merchant data limits remain necessary.

## Fixed P0 Compose override

`deploy/self-hosted/compose.p0-2-2-40.yml` layers resource bounds over the existing
secure template; it does not change ports, secrets, users, networks or volumes.

| Service | RAM cap | RAM+swap cap | CPU cap |
|---|---:|---:|---:|
| PostgreSQL | 384 MiB | 768 MiB | 0.75 |
| One-shot migration | 768 MiB | 1536 MiB | 1 |
| Application | 768 MiB | 1536 MiB | 1 |
| Caddy | 96 MiB | 192 MiB | 0.25 |

Migration must complete and exit before application startup; the executor must
not overlap migration + application on a minimum host. Steady service caps sum
to 1248 MiB, leaving a nominal 800 MiB for the kernel, Docker, agent and other
overhead; actual usable RAM and measured overhead must be recorded. PostgreSQL
uses bounded shared/work/maintenance memory and 30 maximum connections. A
RAM+swap cap does not create swap or prove that swap was available/used.

These candidate limits follow the earlier manual LOW_RESOURCE_STAGING experiment,
where basic startup/readiness/persistence were observed below 2 GiB. That
experiment did not prove the production installer, realistic concurrency, or
this exact P0 release. The new measurements remain mandatory.

## Disposable QEMU evidence harness

`deploy/self-hosted/tests/p0-vm.sh <absolute-prebuilt-payload-directory>` boots a
real Ubuntu guest with `-smp 2 -m 2048` and a 40,000,000,000-byte virtual disk.
It uses Canonical's cloud image, verifies the detached signed checksum manifest
with the Ubuntu cloud-image keyring, and records the exact image SHA256. Docker
is installed from its official signed Ubuntu apt repository. No application or
Docker image is built in the guest; payloads are built/verified by the CI host.

The payload must contain a Linux amd64, `CGO_ENABLED=0` compiled Go test binary
named `resource-probe.test`. Build from the same commit:

```sh
cd agent
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go test -c -o /absolute/payload/resource-probe.test ./internal/bootstrap
```

The fresh guest runs `TestP0RealHostEvidence` before containers are created.
It records actual physical/usable/effective RAM, disk capacity, free disk,
inodes, CPU count and capacity sources. The test additionally requires exact
2 GiB physical / 2 CPUs / 40 GB disk, so an unconstrained host cannot be counted
as the constrained fixture.

If the checked-out repository includes the fixed callback
`deploy/self-hosted/tests/p0-guest-integration.sh`, the harness copies and runs
it as root in that guest. This callback must use the prebuilt signed payload at
`/opt/p0-payload` and must not print passwords, tokens, admin claim codes or keys.
There is no callback URL or arbitrary downloaded shell parameter. SSH keys and
host keys are newly generated for this one local guest; host-key validation is
pinned before boot and SSH ignores host configuration. The only SSH target is
`ubuntu@127.0.0.1` on the QEMU-owned loopback forwarded port. No real VPS alias,
public VPS address or local Windows key is used.

The guest monitor samples memory, swap, disk and OOM counters every two seconds,
and Docker stats periodically. Two new OOM events or less than 4 GiB free disk
stop the test's guest containers and callback. It never removes volumes or
databases. QEMU shutdown retains its virtual disk until the disposable runner
is destroyed. Evidence collection runs on failures too and whitelists resource
records; seed data, SSH keys, runtime secrets and agent state are excluded.

The evidence tag is `ISOLATED_QEMU_GUEST_NOT_PUBLIC_VPS`. Resource preflight is
not installer E2E. A callback result is not proof of production OIDC, public DNS,
public HTTPS/ACME or a real seller's VPS. Record those as separate gates.

## Current verification

- Portable Go tests: passed locally, including under-capacity, quota, overflow,
  update-space and reserve denial cases.
- Go vet for Windows and Linux, Linux amd64 cross-compilation: passed locally.
- Shell syntax and Python AST parsing: passed locally.
- Real Linux root inspection, QEMU guest execution, peak application resources,
  full installer, public HTTPS and restart/backup/restore: **NOT TESTED by this
  workstream yet**; parent CI integration must execute and publish the evidence.

Public primary references: [Canonical checksum verification](https://ubuntu.com/docs/public-images/public-images-how-to/verify-image-checksum/),
[Ubuntu cloud image artifacts](https://ubuntu.com/docs/public-images/public-images-reference/artifacts/),
[Docker's Ubuntu apt installation](https://docs.docker.com/engine/install/ubuntu/).
