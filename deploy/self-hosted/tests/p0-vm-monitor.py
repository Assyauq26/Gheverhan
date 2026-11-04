#!/usr/bin/env python3
"""Public resource evidence for one disposable QEMU guest; no secrets or URLs."""
import json
import os
import pathlib
import signal
import subprocess
import time

root = pathlib.Path('/root')
marker = pathlib.Path('/run/p0-ci-fixture')
if not marker.is_file() or len(marker.read_text().strip()) != 32:
    raise SystemExit('Disposable guest marker required')

def values(file):
    result = {}
    for line in pathlib.Path(file).read_text().splitlines():
        fields = line.replace(':', '').split()
        if len(fields) >= 2 and fields[1].isdigit():
            result[fields[0]] = int(fields[1]) * (1024 if fields[-1] == 'kB' else 1)
    return result

baseline_oom = values('/proc/vmstat').get('oom_kill', 0)
ticks = 0
while not (root / 'p0-monitor-finished').exists():
    memory, vm = values('/proc/meminfo'), values('/proc/vmstat')
    disk = os.statvfs('/')
    sample = {
        'time_unix': time.time(),
        'mem_total_bytes': memory.get('MemTotal'),
        'mem_available_bytes': memory.get('MemAvailable'),
        'swap_total_bytes': memory.get('SwapTotal'),
        'swap_used_bytes': memory.get('SwapTotal', 0) - memory.get('SwapFree', 0),
        'disk_free_bytes': disk.f_bavail * disk.f_frsize,
        'oom_kills_since_start': vm.get('oom_kill', 0) - baseline_oom,
        'swap_in_pages': vm.get('pswpin', 0),
        'swap_out_pages': vm.get('pswpout', 0),
    }
    if ticks % 10 == 0 and pathlib.Path('/usr/bin/docker').exists():
        try:
            command = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
            raw = subprocess.check_output(command + ['stats', '--no-stream', '--format', '{{json .}}'], timeout=10, text=True)
            if len(raw) < 65536:
                sample['docker_stats'] = [json.loads(line) for line in raw.splitlines() if line]
        except (OSError, ValueError, subprocess.SubprocessError):
            sample['docker_stats_unavailable'] = True
    unsafe = sample['oom_kills_since_start'] >= 2 or sample['disk_free_bytes'] < 4 * 1024**3
    if unsafe:
        sample['stopped_reason'] = 'REPEATED_OOM' if sample['oom_kills_since_start'] >= 2 else 'DISK_RESERVE'
        (root / 'p0-resource-stop.json').write_text(json.dumps(sample) + '\n')
        # This is a fresh, isolated guest: the host Docker socket is never
        # mounted and every guest container belongs to this test. Stop only;
        # do not remove containers, databases, volumes or the virtual disk.
        try:
            docker = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
            ids = subprocess.check_output(docker + ['ps', '--quiet'], timeout=10, text=True).split()
            if ids:
                subprocess.run(docker + ['stop', '--time', '5'] + ids, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.SubprocessError):
            pass
        try:
            pid = int((root / 'p0-callback.pid').read_text())
            command = pathlib.Path(f'/proc/{pid}/cmdline').read_bytes()
            if b'/root/p0-guest-integration.sh' in command and os.getpgid(pid) == pid:
                os.killpg(pid, signal.SIGTERM)
        except (OSError, ValueError):
            pass
    with (root / 'p0-resource-samples.jsonl').open('a') as output:
        output.write(json.dumps(sample) + '\n')
    if unsafe:
        break
    ticks += 1
    time.sleep(2)
