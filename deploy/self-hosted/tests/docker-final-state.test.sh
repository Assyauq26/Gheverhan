#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/docker-final-state.sh"
inspect_calls=0; query_status=0; fixture_ids=''; seen=()
fake_docker() {
 case "$1" in
 ps) (( query_status == 0 )) || return "$query_status"; printf '%s\n' "$fixture_ids" ;;
 inspect) inspect_calls=$((inspect_calls+1)); shift; [[ "$1" = --format ]]; shift 2; seen=("$@"); printf 'synthetic false 0\n' ;;
 *) return 99 ;;
 esac
}
collect_container_state fake_docker >/dev/null
test "$inspect_calls" = 0
fixture_ids=$'0123456789ab\nabcdef012345'
collect_container_state fake_docker >/dev/null
test "$inspect_calls" = 1
test "${#seen[@]}" = 2
test "${seen[0]}" = 0123456789ab
test "${seen[1]}" = abcdef012345
fixture_ids='--not-a-container-id'
if collect_container_state fake_docker >/dev/null; then echo 'invalid ID accepted' >&2; exit 1; fi
test "$inspect_calls" = 1
query_status=42
if collect_container_state fake_docker >/dev/null; then echo 'query error hidden' >&2; exit 1; fi
echo 'PASS empty/nonempty/invalid/query-error collection; no Docker access'
