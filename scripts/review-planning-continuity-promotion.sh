#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
  printf 'Planning continuity promotion review failed: %s\n' "$1" >&2
  exit 1
}

require_line() {
  grep -Fq "$1" "$2" || fail "Expected entry was not found: $1"
}

cd "$PROJECT_ROOT"

[[ -f "$BASELINE_CANDID" ]] || fail "Missing captured backend Candid baseline"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree has uncommitted changes"

printf 'Checking source formatting, tests, and stable compatibility...\n'
mops install
mops format --check
mops check "$BACKEND_CANISTER"
mops check-stable "$BACKEND_CANISTER"
mops test

printf 'Checking the native planning intent boundary...\n'
RANKER="$PROJECT_ROOT/private/aion_intelligence/src/MemoryRank.mo"
RELATIONSHIPS="$PROJECT_ROOT/private/aion_intelligence/src/RelationshipExpansion.mo"
PROJECTION="$PROJECT_ROOT/src/teves_consulting_backend/lib/ContinuityPreviewProjection.mo"
require_line '"next action", "next step", "what next", "what should i do"' "$RANKER"
require_line 'case (#planning)' "$RANKER"
require_line 'case (#planning) { memoryType == "decision" or memoryType == "project" or memoryType == "milestone" };' "$RELATIONSHIPS"
require_line 'case (#planning) { "planning" };' "$PROJECTION"

printf 'Building the planning continuity candidate locally...\n'
icp build "$BACKEND_CANISTER"
[[ -s "$GENERATED_CANDID" ]] || fail "The local build did not produce Candid"

printf 'Confirming the Candid contract remains unchanged...\n'
mops check-candid "$GENERATED_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$GENERATED_CANDID"
if ! cmp -s "$GENERATED_CANDID" "$BASELINE_CANDID"; then
  fail "Planning refinement unexpectedly changed the generated Candid contract"
fi

printf 'Confirming the live backend remains on the committed baseline...\n'
icp canister status "$BACKEND_CANISTER" -e "$ENVIRONMENT"
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$LIVE_CANDID"
[[ -s "$LIVE_CANDID" ]] || fail "Live Candid metadata was empty"
