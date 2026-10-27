import importlib.util
import fnmatch
import json
import os
import re
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "ops/helipod-capacity/capacity-audit.py"
spec = importlib.util.spec_from_file_location("capacity", SOURCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
SHA = "a" * 40
CID = "b" * 64
IMAGE = "sha256:" + "c" * 64
SECRET = "SYNTHETIC_SECRET_MUST_NEVER_BE_PRINTED"


class CapacityTests(unittest.TestCase):
    def image(self, tags, refs=0, **fields):
        return {"Id": IMAGE, "RepoTags": tags, "Size": 400, "SharedSize": 300,
                "Containers": refs, **fields}

    def test_reject_arbitrary_docker_endpoint_before_connecting(self):
        for path in ("/containers/create", "/containers/json?all=1&extra=x", "/images/prune",
                     "/volumes/prune", "/containers/../json", "/info\nGET /secrets"):
            with self.subTest(path=path), patch.object(audit, "DockerConnection") as conn:
                with self.assertRaises(audit.Blocked):
                    audit.docker_get(path)
                conn.assert_not_called()

    def test_only_get_and_bounded_response(self):
        with patch.object(audit, "DockerConnection") as conn:
            response = conn.return_value.getresponse.return_value
            response.status = 200
            response.read.return_value = b'{"safe":true}'
            self.assertEqual(audit.docker_get("/info"), {"safe": True})
            conn.return_value.request.assert_called_once_with("GET", "/info")
            response.read.assert_called_once_with(audit.MAX_RESPONSE + 1)
            conn.return_value.close.assert_called_once()

    def test_docker_error_body_not_read(self):
        with patch.object(audit, "DockerConnection") as conn:
            response = conn.return_value.getresponse.return_value
            response.status = 500
            with self.assertRaises(audit.Blocked):
                audit.docker_get("/info")
            response.read.assert_not_called()

    def test_response_over_limit_rejected(self):
        with patch.object(audit, "DockerConnection") as conn:
            response = conn.return_value.getresponse.return_value
            response.status = 200
            response.read.return_value = b"x" * (audit.MAX_RESPONSE + 1)
            with self.assertRaises(audit.Blocked):
                audit.docker_get("/info")

    def test_runtime_and_postgres_and_proxy_remain_protected_even_without_containers(self):
        for tag in ("gheverhan:" + SHA, "gheverhan:rollback", "postgres:17-bookworm", "caddy:2"):
            row = audit.image_inventory([self.image([tag])], set())[0]
            self.assertTrue(row["protected"])

    def test_stopped_or_running_container_reference_protects_image(self):
        for refs in (1, -1):
            self.assertTrue(audit.image_inventory([self.image(["gheverhan-migrate:" + SHA], refs)], set())[0]["protected"])
        self.assertTrue(audit.image_inventory([self.image(["gheverhan-migrate:" + SHA])], {IMAGE})[0]["protected"])

    def test_unused_migration_is_candidate_not_permission_to_delete(self):
        row = audit.image_inventory([self.image(["gheverhan-migrate:" + SHA])], set())[0]
        self.assertEqual(row["classification"], "unused_migration_candidate_requires_approval")
        self.assertEqual(row["uniqueBytes"], 100)

    def test_mixed_or_unknown_tags_are_preserved(self):
        for tags in ([], ["other:latest"], ["gheverhan-migrate:" + SHA, "other:rollback"]):
            row = audit.image_inventory([self.image(tags)], set())[0]
            self.assertEqual(row["classification"], "unclassified_preserve_pending_review")

    def test_unknown_shared_size_not_reported_as_reclaimable(self):
        row = audit.image_inventory([self.image(["gheverhan-migrate:" + SHA], SharedSize=-1)], set())[0]
        self.assertIsNone(row["uniqueBytes"])

    def test_foreign_command_and_arguments_cannot_touch_lock(self):
        for command, argv in (("id", ["audit"]), ("", ["audit"]), (audit.TOKEN, ["audit", "--delete"])):
            with patch.dict(os.environ, {"SSH_ORIGINAL_COMMAND": command}), patch.object(audit.sys, "argv", argv), patch.object(audit.os, "open") as opening:
                with self.assertRaises(audit.Blocked):
                    audit.main()
                opening.assert_not_called()

    def test_directory_scan_is_low_priority_bounded_and_never_shell(self):
        with patch.object(audit.subprocess, "run", return_value=Mock(returncode=0, stdout=b"123\t/var\n100\t/var/lib\n")) as run:
            data = audit.directory_sizes("/var")
            self.assertTrue(data["complete"])
            args, kwargs = run.call_args
            self.assertIn("/usr/bin/du", args[0])
            self.assertIn("/usr/bin/ionice", args[0])
            self.assertIn("-x", args[0])
            self.assertEqual(kwargs["timeout"], 15)
            self.assertNotIn("shell", kwargs)
            self.assertNotIn("DIRECT_URL", kwargs["env"])

    def test_partial_scan_does_not_masquerade_as_complete(self):
        with patch.object(audit.subprocess, "run", return_value=Mock(returncode=124, stdout=b"12\t/var\n")):
            self.assertEqual(audit.directory_sizes("/var"), {"path": "/var", "complete": False, "entries": []})

    def test_no_environment_logs_or_daemon_commands_in_report(self):
        detail = {"Image": IMAGE, "Name": "/deploy_app_1", "Config": {"Image": "gheverhan:" + SHA, "Env": [SECRET], "Cmd": [SECRET]},
                  "State": {"Status": "running", "Error": SECRET}, "LogPath": "",
                  "Mounts": [{"Type": "volume", "Name": "deploy_postgres", "Source": "/var/lib/docker/volumes/deploy_postgres/_data", "Destination": "/var/lib/postgresql/data"}]}
        responses = {"/info": {"DockerRootDir": "/var/lib/docker", "HttpProxy": SECRET},
                     "/system/df": {"Images": [self.image(["gheverhan:" + SHA], 1, Labels={"secret": SECRET})], "BuildCache": [{"ID": "cache-1", "Size": 100, "Description": SECRET}]},
                     "/containers/json?all=1": [{"Id": CID, "Command": SECRET}],
                     "/containers/" + CID + "/json": detail,
                     "/volumes": {"Volumes": [{"Name": "deploy_postgres", "Mountpoint": "/var/lib/docker/volumes/deploy_postgres/_data", "Options": {"password": SECRET}}]}}
        with patch.object(audit, "docker_get", side_effect=lambda p: responses[p]), \
             patch.object(audit.os.path, "exists", return_value=True), patch.object(audit.os.path, "isdir", return_value=True), \
             patch.object(audit, "filesystem", side_effect=lambda p: {"path": p, "availableBytes": 20 * audit.GIB}), \
             patch.object(audit, "directory_sizes", side_effect=lambda p: {"path": p, "complete": True, "entries": []}):
            report = audit.collect()
        self.assertNotIn(SECRET, json.dumps(report))
        self.assertFalse(report["capacityGate"]["deploymentAuthorized"])
        self.assertEqual(report["capacityGate"]["status"], "CAPACITY_ONLY_PASS")
        self.assertIn("/opt/gheverhan/media", report["protectedPaths"])
        self.assertEqual(report["volumes"][0]["policy"], "preserve_all_volumes_including_unattached")

    def test_control_characters_and_relative_paths_rejected(self):
        for path in ("../../etc", "/var\nsecret", "/" + "a" * 600):
            with self.assertRaises(audit.Blocked):
                audit.safe_path(path)

    def test_workflow_has_separate_identity_and_no_deploy_execution(self):
        workflow = (ROOT / ".github/workflows/helipod-capacity-audit.yml").read_text()
        for required in ("workflow_dispatch:", "production-diagnostics", "refs/heads/main", "READ_ONLY_CAPACITY_V1", "HELI_POD_AUDIT_KEY_B64", "StrictHostKeyChecking=yes", "gheverhan-audit@43.173.21.197", "gheverhan-capacity-v1", "collectorSha256", "retention-days: 1"):
            self.assertIn(required, workflow)
        for forbidden in ("pull_request:", "HELI_POD_DEPLOY_KEY_B64", "DATABASE_URL", "DIRECT_URL", "docker load", "docker prune", "migrate deploy", "checkout@", "set -x"):
            self.assertNotIn(forbidden, workflow)

    def test_installer_syntax_without_execution(self):
        result = subprocess.run(["bash", "-n", str(ROOT / "ops/helipod-capacity/install-capacity-audit.sh")], capture_output=True)
        self.assertEqual(result.returncode, 0)

    def test_low_space_missing_media_or_incomplete_scans_cannot_pass_capacity_gate(self):
        responses = {"/info": {"DockerRootDir": "/var/lib/docker"}, "/system/df": {},
                     "/containers/json?all=1": [], "/volumes": {"Volumes": []}}
        for free, missing, complete in ((2 * audit.GIB, False, True), (20 * audit.GIB, True, True), (20 * audit.GIB, False, False)):
            with self.subTest(free=free, missing=missing, complete=complete), \
                 patch.object(audit, "docker_get", side_effect=lambda p: responses[p]), \
                 patch.object(audit.os.path, "exists", side_effect=lambda p: not (missing and p == "/opt/gheverhan/media")), \
                 patch.object(audit.os.path, "isdir", return_value=True), \
                 patch.object(audit, "filesystem", side_effect=lambda p: {"path": p, "availableBytes": free}), \
                 patch.object(audit, "directory_sizes", side_effect=lambda p: {"path": p, "complete": complete, "entries": []}):
                report = audit.collect()
                self.assertEqual(report["capacityGate"]["status"], "BLOCKED")
                self.assertFalse(report["capacityGate"]["deploymentAuthorized"])

    def test_busy_deployment_lock_is_opened_without_write_or_create_and_blocks_queries(self):
        with patch.dict(os.environ, {"SSH_ORIGINAL_COMMAND": audit.TOKEN}), \
             patch.object(audit.sys, "argv", ["audit"]), patch.object(audit.os, "geteuid", return_value=0), \
             patch.object(audit.os, "open", return_value=99) as opening, \
             patch.object(audit.os, "fstat", return_value=Mock(st_mode=0o100644, st_uid=0)), \
             patch.object(audit.os, "close") as closing, \
             patch.object(audit.fcntl, "flock", side_effect=BlockingIOError), \
             patch.object(audit, "collect") as collecting:
            with self.assertRaises(BlockingIOError):
                audit.main()
            flags = opening.call_args.args[1]
            self.assertEqual(flags & (os.O_CREAT | os.O_WRONLY | os.O_RDWR | os.O_TRUNC), 0)
            collecting.assert_not_called()
            closing.assert_called_once_with(99)

    def test_diagnostics_paths_do_not_trigger_existing_main_autodeploy(self):
        text = (ROOT / ".github/workflows/helipod-autodeploy.yml").read_text()
        patterns = re.findall(r'^\s+- "([^\"]+)"$', text, re.M)
        self.assertTrue(patterns)
        for path in ("ops/helipod-capacity/capacity-audit.py", "ops/helipod-capacity/install-capacity-audit.sh",
                     ".github/workflows/helipod-capacity-audit.yml", ".github/workflows/helipod-capacity-audit-checks.yml",
                     "docs/operations/helipod-capacity/README.md"):
            self.assertFalse(any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns), path)

    def test_dispatch_guard_fails_before_credentials_for_wrong_ref_or_acknowledgement(self):
        workflow = (ROOT / ".github/workflows/helipod-capacity-audit.yml").read_text()
        guard = next(line.strip() for line in workflow.splitlines() if line.strip().startswith('test "$DISPATCH_REF"'))
        for ref, ack, success in (("refs/heads/main", "READ_ONLY_CAPACITY_V1", True),
                                  ("refs/heads/untrusted", "READ_ONLY_CAPACITY_V1", False),
                                  ("refs/heads/main", "anything", False)):
            result = subprocess.run(["bash", "-c", guard], env={"DISPATCH_REF": ref, "ACKNOWLEDGEMENT": ack}, capture_output=True)
            self.assertEqual(result.returncode == 0, success)

    def test_installer_with_no_arguments_exits_before_provisioning(self):
        result = subprocess.run(["bash", str(ROOT / "ops/helipod-capacity/install-capacity-audit.sh")], capture_output=True)
        self.assertEqual(result.returncode, 64)
        self.assertIn(b"approved administrator", result.stderr)


if __name__ == "__main__":
    unittest.main()
