#!/usr/bin/env bash
set -euo pipefail
collect_container_state() {
  local output id
  local -a ids=()
  output=$("$@" ps --all --quiet) || return "$?"
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || return 1
    ids+=("$id")
  done <<< "$output"
  (( ${#ids[@]} > 0 )) || return 0
  "$@" inspect --format '{{.Name}} {{.State.OOMKilled}} {{.RestartCount}}' "${ids[@]}"
}
if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" = "$0" ]]; then
  collect_container_state /usr/bin/docker --host unix:///var/run/docker.sock
fi
