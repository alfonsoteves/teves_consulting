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
  printf 'Operator authorization promotion review failed: %s\n' "$1" >&2
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
mops check-stable "$BACKEND_CANISTER"
mops test

printf 'Building the operator authorization candidate locally...\n'
icp build "$BACKEND_CANISTER"
[[ -s "$GENERATED_CANDID" ]] || fail "The local build did not produce Candid"

printf 'Checking the additive operator authorization contract...\n'
mops check-candid "$GENERATED_CANDID" "$BASELINE_CANDID"
if mops check-candid "$BASELINE_CANDID" "$GENERATED_CANDID" >/dev/null 2>&1; then
  fail "Candidate did not add the expected getOperatorStatus method"
fi

baseline_methods="$(service_methods "$BASELINE_CANDID")"
candidate_methods="$(service_methods "$GENERATED_CANDID")"
expected_candidate_methods="$(printf '%s\n%s\n' "$baseline_methods" 'getOperatorStatus' | sort -u)"
[[ "$candidate_methods" == "$expected_candidate_methods" ]] || fail "Candidate changed service methods beyond getOperatorStatus"

require_line 'getOperatorStatus:' "$GENERATED_CANDID"
require_line 'allowlistConfigured: bool;' "$GENERATED_CANDID"
require_line 'isOperator: bool;' "$GENERATED_CANDID"
require_line 'operatorCount: nat;' "$GENERATED_CANDID"
require_line 'recoveryConfigured: bool;' "$GENERATED_CANDID"
require_line 'getFeedbackCount: () -> (nat) query;' "$GENERATED_CANDID"
require_line 'getFeedbackEntries: () -> (vec Feedback) query;' "$GENERATED_CANDID"
require_line 'getRecentFeedback: (limit: nat) -> (vec Feedback) query;' "$GENERATED_CANDID"
if grep -Fq 'getOperatorStatus:' "$BASELINE_CANDID"; then
  fail "Committed baseline already contains getOperatorStatus"
fi

printf 'Confirming the live backend remains on the committed baseline...\n'
icp canister status "$BACKEND_CANISTER" -e "$ENVIRONMENT"
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$LIVE_CANDID"
[[ -s "$LIVE_CANDID" ]] || fail "Live Candid metadata was empty"
mops check-candid "$LIVE_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$LIVE_CANDID"
require_line 'getFeedbackCount: () -> (nat) query;' "$LIVE_CANDID"
if grep -Fq 'getOperatorStatus:' "$LIVE_CANDID"; then
  fail "Live backend already exposes getOperatorStatus"
fi

printf 'Operator authorization promotion review passed. No snapshot was created and no canister was upgraded.\n'
