#!/usr/bin/env bash
# Read-only advisory gate. Never installs, connects networks or changes production.
set -euo pipefail
available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
free_bytes=$(df -PB1 /var/lib/docker | awk 'NR==2 {print $4}')
printf 'MemAvailableKiB=%s DockerDiskFreeBytes=%s\n' "$available_kib" "$free_bytes"
# Runtime: db384 + control256; migration transient192; allow64 probe overhead.
# Disk: image/pull/update6GiB + database1GiB + logs1GiB + reserve4GiB.
((available_kib >= 896*1024)) || { echo 'BLOCKED: insufficient available RAM, swap excluded'; exit 1; }
((free_bytes >= 12*1024*1024*1024)) || { echo 'BLOCKED: require12GiB free on Docker filesystem'; exit 1; }
echo 'CAPACITY_CANDIDATE_ONLY: review sustained peaks and whole-host limits before approval'
