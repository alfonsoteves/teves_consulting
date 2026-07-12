#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"

fail() {
  printf 'Certified policy lifecycle smoke test failed: %s\n' "$1" >&2
  exit 1
}

cleanup_note() {
  printf 'Local cleanup: icp canister stop teves_consulting_backend -e local && icp canister delete teves_consulting_backend -e local && icp network stop && rm -f .icp/data/mappings/local.ids.json\n'
}
trap cleanup_note EXIT

[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this smoke test."

cd "$PROJECT_ROOT"

printf 'Building the certified-policy lifecycle backend locally...\n'
icp build teves_consulting_backend
[[ -f "$BACKEND_WASM" ]] || fail "Backend WASM was not produced"

printf 'Starting an isolated local ICP network...\n'
icp network start -d

printf 'Creating and installing the local backend...\n'
icp canister create teves_consulting_backend -e local
icp canister install teves_consulting_backend -e local --mode install --wasm "$BACKEND_WASM"

printf 'Writing sample state before the certification lifecycle upgrade...\n'
icp canister call teves_consulting_backend addFeedback \
  '("up", "certified-policy-lifecycle", "sample answer", "2026-07-12")' \
  -e local >/dev/null

feedback_before="$(icp canister call teves_consulting_backend getFeedbackEntries '()' -e local --query)"
grep -q 'certified-policy-lifecycle' <<<"$feedback_before" || fail "Sample feedback was not readable after install"

printf 'Upgrading the same backend to re-run the certification lifecycle...\n'
icp canister install teves_consulting_backend -e local --mode upgrade --wasm "$BACKEND_WASM"

feedback_after="$(icp canister call teves_consulting_backend getFeedbackEntries '()' -e local --query)"
[[ "$feedback_before" == "$feedback_after" ]] || fail "Feedback changed across the lifecycle upgrade"

printf 'Certified policy lifecycle local smoke test passed.\n'
printf 'The digest-setting lifecycle completed on install and upgrade without changing stored feedback.\n'
