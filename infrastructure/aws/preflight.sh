#!/usr/bin/env bash
# Read-only checks. Does not install tools, create resources or change AWS state.
set -euo pipefail
status=0
for tool in aws terraform docker; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'OK: %s is installed\n' "$tool"
  else
    printf 'MISSING: %s\n' "$tool" >&2
    status=1
  fi
done
if command -v docker >/dev/null 2>&1; then
  if ! docker compose version; then status=1; fi
  if ! docker info >/dev/null 2>&1; then
    printf '%s\n' 'Docker daemon is unavailable to this user.' >&2
    status=1
  fi
fi
if [[ "${1:-}" == '--aws' ]]; then
  if command -v aws >/dev/null 2>&1; then
    # Identifies the account/role only. Never prints credentials or secret values.
    if ! aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json; then
      status=1
    fi
  fi
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--aws]\n' "$0" >&2
  exit 2
fi
exit "$status"
