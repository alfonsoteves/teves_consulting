#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_CANISTER="teves_consulting_backend"
ENVIRONMENT="ic"
BASELINE_CANDID="$PROJECT_ROOT/deployed/teves_consulting_backend.did"
GENERATED_CANDID="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.did"
LIVE_CANDID="$(mktemp "${TMPDIR:-/tmp}/teves_consulting_backend_live.XXXXXX.did")"

cleanup() {
  rm -f "$LIVE_CANDID"
}
trap cleanup EXIT

fail() {
  printf 'Motoko backend preflight failed: %s\n' "$1" >&2
  exit 1
}

cd "$PROJECT_ROOT"

[[ -f "$BASELINE_CANDID" ]] || fail "Missing captured backend Candid baseline"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree has uncommitted changes"

printf 'Checking source formatting and native upgrade compatibility...\n'
mops install
mops format --check
mops check "$BACKEND_CANISTER"

printf 'Building the backend locally through the ICP recipe...\n'
icp build "$BACKEND_CANISTER"
[[ -s "$GENERATED_CANDID" ]] || fail "The local build did not produce Candid"

printf 'Checking the generated interface against the committed baseline...\n'
mops check-candid "$GENERATED_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$GENERATED_CANDID"

printf 'Checking the live backend status and interface...\n'
icp canister status "$BACKEND_CANISTER" -e "$ENVIRONMENT"
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$LIVE_CANDID"
[[ -s "$LIVE_CANDID" ]] || fail "Live Candid metadata was empty"
mops check-candid "$LIVE_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$LIVE_CANDID"

printf 'Preflight passed. No snapshot was created and no canister was upgraded.\n'
