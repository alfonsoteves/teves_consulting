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
  printf 'HTTPS outcall transport promotion review failed: %s\n' "$1" >&2
  exit 1
}

service_methods() {
  sed -n '/^service : {/,/^}/p' "$1" |
    sed -nE 's/^  ([[:alnum:]_]+):.*/\1/p' |
    sort
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

printf 'Building the HTTPS outcall transport candidate locally...\n'
icp build "$BACKEND_CANISTER"
[[ -s "$GENERATED_CANDID" ]] || fail "The local build did not produce Candid"

printf 'Checking the additive HTTPS outcall transport contract...\n'
mops check-candid "$GENERATED_CANDID" "$BASELINE_CANDID"
if mops check-candid "$BASELINE_CANDID" "$GENERATED_CANDID" >/dev/null 2>&1; then
  fail "Candidate did not add the expected HTTPS outcall transport method"
fi

baseline_methods="$(service_methods "$BASELINE_CANDID")"
candidate_methods="$(service_methods "$GENERATED_CANDID")"
expected_candidate_methods="$(printf '%s\n%s\n' "$baseline_methods" 'probeHttpsOutcallTransport' | sort -u)"
[[ "$candidate_methods" == "$expected_candidate_methods" ]] || fail "Candidate changed service methods beyond probeHttpsOutcallTransport"

require_line 'type Receipt =' "$GENERATED_CANDID"
require_line 'isReplicated: bool;' "$GENERATED_CANDID"
require_line 'responseBytes: nat;' "$GENERATED_CANDID"
require_line 'status: nat;' "$GENERATED_CANDID"
require_line 'url: text;' "$GENERATED_CANDID"
require_line 'probeHttpsOutcallTransport: () -> (Receipt);' "$GENERATED_CANDID"
if grep -Fq 'probeHttpsOutcallTransport:' "$BASELINE_CANDID"; then
  fail "Committed baseline already contains probeHttpsOutcallTransport"
fi

printf 'Checking the fixed non-replicated transport policy...\n'
POLICY="$PROJECT_ROOT/private/aion_intelligence/src/HttpsOutcallPolicy.mo"
TRANSPORT="$PROJECT_ROOT/src/teves_consulting_backend/lib/HttpsOutcallTransport.mo"
require_line 'public let probeUrl = "https://www.tevesconsulting.com/";' "$POLICY"
require_line 'public let maxResponseBytes : Nat = 32_768;' "$POLICY"
require_line 'public let maxAttachedCycles : Nat = 20_000_000_000;' "$POLICY"
require_line 'isReplicated = false;' "$POLICY"
require_line 'headers = [];' "$TRANSPORT"
require_line 'body = null;' "$TRANSPORT"
require_line 'method = #get;' "$TRANSPORT"
require_line 'transform = null;' "$TRANSPORT"
require_line 'is_replicated = ?false;' "$TRANSPORT"
require_line 'responseBytes = response.body.size();' "$TRANSPORT"

printf 'Confirming the live backend remains on the committed baseline...\n'
icp canister status "$BACKEND_CANISTER" -e "$ENVIRONMENT"
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$LIVE_CANDID"
[[ -s "$LIVE_CANDID" ]] || fail "Live Candid metadata was empty"
mops check-candid "$LIVE_CANDID" "$BASELINE_CANDID"
mops check-candid "$BASELINE_CANDID" "$LIVE_CANDID"
if grep -Fq 'probeHttpsOutcallTransport:' "$LIVE_CANDID"; then
  fail "Live backend already exposes probeHttpsOutcallTransport"
fi

printf 'Promotion review passed. No outbound request, snapshot, or canister upgrade was created.\n'
