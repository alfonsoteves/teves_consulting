#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"

fail() {
  printf 'Certified policy snapshot smoke test failed: %s\n' "$1" >&2
  exit 1
}

require_policy_snapshot() {
  local response="$1"

  grep -q 'policyVersion = "aion-provider-policy-v1"' <<<"$response" || fail "Policy version was not returned"
  grep -q 'publicAnswer|openai|openai-production-baseline|1|0|0|0' <<<"$response" || fail "Public answer route was not included in the snapshot"
  grep -q 'adminCandidateEvaluation|icp-llm|icp-admin-candidate|1|1|1|0' <<<"$response" || fail "Admin candidate route was not included in the snapshot"
  grep -q 'nativeContinuityPreview|none|native-continuity-preview|0|0|0|0' <<<"$response" || fail "Provider-free continuity route was not included in the snapshot"
  grep -q 'snapshotHash = blob' <<<"$response" || fail "Snapshot hash was not returned"
  grep -q 'certificate =' <<<"$response" || fail "Certificate field was not returned"
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

printf 'Reading the certified policy snapshot after install...\n'
policy_before="$(icp canister call teves_consulting_backend getCertifiedAionProviderPolicy '()' -e local --query)"
require_policy_snapshot "$policy_before"
canonical_snapshot_before="$(grep 'canonicalSnapshot =' <<<"$policy_before")"
snapshot_hash_before="$(grep 'snapshotHash =' <<<"$policy_before")"

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

printf 'Reading the certified policy snapshot after upgrade...\n'
policy_after="$(icp canister call teves_consulting_backend getCertifiedAionProviderPolicy '()' -e local --query)"
require_policy_snapshot "$policy_after"
canonical_snapshot_after="$(grep 'canonicalSnapshot =' <<<"$policy_after")"
snapshot_hash_after="$(grep 'snapshotHash =' <<<"$policy_after")"
[[ "$canonical_snapshot_before" == "$canonical_snapshot_after" ]] || fail "Canonical policy snapshot changed across the lifecycle upgrade"
[[ "$snapshot_hash_before" == "$snapshot_hash_after" ]] || fail "Snapshot hash changed across the lifecycle upgrade"

printf 'Certified policy snapshot local smoke test passed.\n'
printf 'The policy snapshot and digest remained stable across install and upgrade without changing stored feedback.\n'
