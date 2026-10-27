#!/usr/bin/python3 -I
"""Root-owned forced SSH command. Fixed read-only queries; never a shell gateway."""
import datetime
import fcntl
import http.client
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys

TOKEN = "gheverhan-capacity-v1"
LOCK = "/run/lock/gheverhan-deploy.lock"
MAX_RESPONSE = 8 * 1024 * 1024
GIB = 1024 ** 3


class Blocked(Exception):
    pass


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost", timeout=20)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


def docker_get(path):
    fixed = {"/info", "/system/df", "/containers/json?all=1", "/volumes"}
    if path not in fixed and not re.fullmatch(r"/containers/[a-f0-9]{64}/json", path):
        raise Blocked("unapproved_docker_query")
    connection = DockerConnection()
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        if response.status != 200:
            raise Blocked("docker_query_failed")
        body = response.read(MAX_RESPONSE + 1)
        if len(body) > MAX_RESPONSE:
            raise Blocked("docker_response_too_large")
        return json.loads(body)
    finally:
        connection.close()


def safe_path(value):
    if not isinstance(value, str) or not value.startswith("/") or len(value) > 512:
        raise Blocked("invalid_metadata_path")
    if any(ord(c) < 32 for c in value):
        raise Blocked("invalid_metadata_path")
    return value


def token(value):
    # Metadata only; refuse control characters/oversized daemon strings.
    if not isinstance(value, str) or len(value) > 256 or any(ord(c) < 32 for c in value):
        raise Blocked("invalid_metadata_token")
    return value


def filesystem(path):
    path = safe_path(path)
    data = os.statvfs(path)
    return {"path": path, "device": os.stat(path).st_dev,
            "totalBytes": data.f_blocks * data.f_frsize,
            "availableBytes": data.f_bavail * data.f_frsize,
            "usedBytes": (data.f_blocks - data.f_bfree) * data.f_frsize,
            "inodes": data.f_files, "availableInodes": data.f_favail}


def directory_sizes(path):
    # Directory metadata only. Never list media objects or database filenames.
    path = safe_path(path)
    result = subprocess.run(
        ["/usr/bin/timeout", "12", "/usr/bin/ionice", "-c", "3",
         "/usr/bin/nice", "-n", "19", "/usr/bin/du", "-x", "-B1", "-d1", "--", path],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
        check=False,
    )
    if result.returncode != 0 or len(result.stdout) > MAX_RESPONSE:
        return {"path": path, "complete": False, "entries": []}
    rows = []
    for line in result.stdout.decode("utf-8", errors="strict").splitlines():
        size, separator, name = line.partition("\t")
        if not separator or not size.isdigit():
            raise Blocked("invalid_directory_metadata")
        rows.append({"path": safe_path(name), "bytes": int(size)})
    return {"path": path, "complete": True,
            "entries": sorted(rows, key=lambda x: x["bytes"], reverse=True)[:20]}


def image_inventory(images, protected_ids):
    output = []
    for image in images:
        image_id = token(image["Id"])
        tags = [token(t) for t in (image.get("RepoTags") or [])]
        size, shared = image.get("Size", -1), image.get("SharedSize", -1)
        references = image.get("Containers", -1)
        runtime = any(t.startswith("gheverhan:") for t in tags)
        infrastructure = any(t.startswith(("postgres:", "caddy:")) for t in tags)
        protected = image_id in protected_ids or references != 0 or runtime or infrastructure
        # This is an approval candidate, never an automatic deletion list.
        candidate = (not protected and bool(tags) and
                     all(re.fullmatch(r"gheverhan-migrate:[a-f0-9]{40}", t) for t in tags))
        output.append({"id": image_id, "tags": tags, "created": image.get("Created"),
                       "sizeBytes": size, "sharedBytes": shared,
                       "uniqueBytes": max(0, size - shared) if size >= 0 and shared >= 0 else None,
                       "containerReferences": references, "protected": protected,
                       "classification": "unused_migration_candidate_requires_approval" if candidate
                       else "preserve_runtime_rollback_or_infrastructure" if protected
                       else "unclassified_preserve_pending_review"})
    return output


def collect():
    info = docker_get("/info")
    usage = docker_get("/system/df")
    containers = []
    protected_ids = set()
    protected_paths = {"/opt/gheverhan/media"}
    protected_volumes = set()
    for brief in docker_get("/containers/json?all=1"):
        cid = token(brief["Id"])
        detail = docker_get("/containers/" + cid + "/json")
        protected_ids.add(token(detail["Image"]))
        mounts = []
        for mount in detail.get("Mounts", []):
            source = safe_path(mount["Source"])
            protected_paths.add(source)
            name = token(mount.get("Name", ""))
            if name:
                protected_volumes.add(name)
            mounts.append({"type": token(mount["Type"]), "source": source,
                           "destination": safe_path(mount["Destination"]), "volume": name})
        log_size = None
        # stat only; never read container logs, commands or environment values.
        log_path = detail.get("LogPath")
        if log_path and os.path.isfile(log_path):
            log_size = os.stat(log_path).st_size
        state = detail.get("State", {})
        containers.append({"id": cid, "name": token(detail["Name"]),
                           "imageId": token(detail["Image"]),
                           "image": token(detail["Config"]["Image"]),
                           "status": token(state.get("Status", "unknown")),
                           "health": token(state.get("Health", {}).get("Status", "not_configured")),
                           "mounts": mounts, "logBytes": log_size})
    volumes = []
    sizes = {v["Name"]: v.get("UsageData", {}) for v in usage.get("Volumes") or []}
    for volume in docker_get("/volumes").get("Volumes") or []:
        name = token(volume["Name"])
        volumes.append({"name": name, "mountpoint": safe_path(volume["Mountpoint"]),
                        "sizeBytes": sizes.get(name, {}).get("Size", -1),
                        "references": sizes.get(name, {}).get("RefCount", -1),
                        "attachedToKnownContainer": name in protected_volumes,
                        "policy": "preserve_all_volumes_including_unattached"})
    root = safe_path(info["DockerRootDir"])
    paths = sorted({"/", root, *protected_paths})
    filesystems = [filesystem(p) for p in paths if os.path.exists(p)]
    scans = [directory_sizes(p) for p in dict.fromkeys(
             ("/", "/var", "/var/lib", "/var/log", "/var/cache", "/opt", "/opt/gheverhan", root))
             if os.path.isdir(p)]
    cache = [{"id": token(c["ID"]), "sizeBytes": c.get("Size", -1),
              "inUse": c.get("InUse"), "shared": c.get("Shared"),
              "lastUsedAt": c.get("LastUsedAt")}
             for c in usage.get("BuildCache") or []]
    missing_paths = [p for p in paths if not os.path.exists(p)]
    complete = all(s["complete"] for s in scans) and not missing_paths
    capacity = all(f["availableBytes"] >= 10 * GIB for f in filesystems)
    return {"schemaVersion": 1, "readOnly": True, "host": "43.173.21.197",
            "collectorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "complete": complete, "missingPaths": missing_paths,
            "filesystems": filesystems, "directories": scans,
            "containers": containers,
            "images": image_inventory(usage.get("Images") or [], protected_ids),
            "volumes": volumes, "buildCache": cache,
            "protectedPaths": sorted(protected_paths),
            "rollbackPolicy": "preserve_all_gheverhan_runtime_images_until_last_good_is_confirmed",
            "capacityGate": {"minimumAvailableBytes": 10 * GIB,
                             "status": "CAPACITY_ONLY_PASS" if complete and capacity else "BLOCKED",
                             "deploymentAuthorized": False,
                             "additionalGates": ["measured_image_import_peak_and_database_reserve",
                                                 "verified_external_database_and_media_backup",
                                                 "confirmed_last_good_rollback", "explicit_release_approval"]}}


def main():
    if len(sys.argv) != 1 or os.environ.get("SSH_ORIGINAL_COMMAND") != TOKEN or os.geteuid() != 0:
        raise Blocked("unapproved_invocation")
    # Never create the deployment lock as part of a read-only audit.
    lock_fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        mode = os.fstat(lock_fd)
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != 0:
            raise Blocked("untrusted_deploy_lock")
        fcntl.flock(lock_fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Blocked("audit_timeout")))
        signal.alarm(180)
        print(json.dumps(collect(), separators=(",", ":"), allow_nan=False))
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Suppress raw Docker responses, exception details, filesystem contents.
        print('{"schemaVersion":1,"readOnly":true,"error":"audit_blocked_or_incomplete"}')
        sys.exit(1)
