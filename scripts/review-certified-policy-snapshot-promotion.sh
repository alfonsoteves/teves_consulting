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
  printf 'Certified policy snapshot promotion review failed: %s\n' "$1" >&2
  exit 1
}

service_methods() {
  sed -n '/^service : {/,/^}/p' "$1" |
    sed -nE 's/^  ([[:alnum:]_]+):.*/\1/p' |
    sort
}

require_line() {
  grep -Fq "$1" "$2" || fail "Expected Candid entry was not found: $1"
}

cd "$PROJECT_ROOT"

[[ -f "$BASELINE_CANDID" ]] || fail "Missing captured backend Candid baseline"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree has uncommitted changes"

printf 'Checking source formatting, tests, and stable compatibility...\n'
mops install
mops format --check
mops check "$BACKEND_CANISTER"
mops test

printf 'Building the certified policy snapshot candidate locally...\n'
icp build "$BACKEND_CANISTER"
[[ -s "$GENERATED_CANDID" ]] || fail "The local build did not produce Candid"

printf 'Checking the additive certified policy snapshot contract...\n'
mops check-candid "$GENERATED_CANDID" "$BASELINE_CANDID"
if mops check-candid "$BASELINE_CANDID" "$GENERATED_CANDID" >/dev/null 2>&1; then
  fail "Candidate did not add the expected certified policy snapshot method"
fi

baseline_methods="$(service_methods "$BASELINE_CANDID")"
candidate_methods="$(service_methods "$GENERATED_CANDID")"
expected_candidate_methods="$(printf '%s\n%s\n' "$baseline_methods" 'getCertifiedAionProviderPolicy' | sort -u)"
[[ "$candidate_methods" == "$expected_candidate_methods" ]] || fail "Candidate changed service methods beyond getCertifiedAionProviderPolicy"

require_line 'getCertifiedAionProviderPolicy:' "$GENERATED_CANDID"
require_line 'canonicalSnapshot: text;' "$GENERATED_CANDID"
require_line 'certificate: opt blob;' "$GENERATED_CANDID"
require_line 'policyVersion: text;' "$GENERATED_CANDID"
require_line 'snapshotHash: blob;' "$GENERATED_CANDID"
require_line 'previewMyContinuity: (queryText: text) -> (Result) query;' "$GENERATED_CANDID"
require_line 'previewAionProviderRoute: (operation: Operation) -> (Response__1) query;' "$GENERATED_CANDID"
if grep -Fq 'getCertifiedAionProviderPolicy:' "$BASELINE_CANDID"; then
  fail "Committed baseline already contains getCertifiedAionProviderPolicy"
fi

printf 'Confirming the live backend remains on the committed baseline...\n'
icp canister status "$BACKEND_CANISTER" -e "$ENVIRONMENT"
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$LIVE_CANDID"
[[ -s "$LIVE_CANDID" ]] || fail "Live Candid metadata was empty"
mops check-candid "$LIVE_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$LIVE_CANDID"
require_line 'previewMyContinuity: (queryText: text) -> (Result) query;' "$LIVE_CANDID"
require_line 'previewAionProviderRoute: (operation: Operation) -> (Response__1) query;' "$LIVE_CANDID"
if grep -Fq 'getCertifiedAionProviderPolicy:' "$LIVE_CANDID"; then
  fail "Live backend already exposes getCertifiedAionProviderPolicy"
fi

printf 'Certified policy snapshot promotion review passed. No snapshot was created and no canister was upgraded.\n'
