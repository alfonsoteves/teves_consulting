#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"

fail() {
  printf 'Provider route preview local smoke test failed: %s\n' "$1" >&2
  exit 1
}

cleanup_note() {
  printf 'Local cleanup: icp canister stop teves_consulting_backend -e local && icp canister delete teves_consulting_backend -e local && icp network stop && rm -f .icp/data/mappings/local.ids.json\n'
}
trap cleanup_note EXIT

[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this smoke test."

cd "$PROJECT_ROOT"

printf 'Building the native provider route preview backend locally...\n'
icp build teves_consulting_backend
[[ -f "$BACKEND_WASM" ]] || fail "Backend WASM was not produced"

printf 'Starting an isolated local ICP network...\n'
icp network start -d

printf 'Creating and installing the local backend...\n'
icp canister create teves_consulting_backend -e local
icp canister install teves_consulting_backend -e local --mode install --wasm "$BACKEND_WASM"

before_summaries="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e local --query)"
before_feedback="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e local --query)"

printf 'Checking the public answer route...\n'
public_answer="$(icp canister call teves_consulting_backend previewAionProviderRoute \
  '(variant {publicAnswer})' \
  -e local --query)"
grep -q 'providerId = "openai"' <<<"$public_answer" || fail "Public answer route did not select OpenAI"
grep -q 'routeId = "openai-production-baseline"' <<<"$public_answer" || fail "Public answer route identifier was incorrect"
grep -q 'invocationPermitted = true' <<<"$public_answer" || fail "Public answer invocation was not permitted"
grep -q 'automaticFallback = false' <<<"$public_answer" || fail "Public answer unexpectedly enabled automatic fallback"

printf 'Checking the Admin candidate route...\n'
candidate="$(icp canister call teves_consulting_backend previewAionProviderRoute \
  '(variant {adminCandidateEvaluation})' \
  -e local --query)"
grep -q 'providerId = "icp-llm"' <<<"$candidate" || fail "Admin candidate route did not select ICP LLM"
grep -q 'routeId = "icp-admin-candidate"' <<<"$candidate" || fail "Admin candidate route identifier was incorrect"
grep -q 'explicitOperatorAction = true' <<<"$candidate" || fail "Admin candidate route did not require explicit operator action"
grep -q 'promotionRequired = true' <<<"$candidate" || fail "Admin candidate route did not require promotion"
grep -q 'automaticFallback = false' <<<"$candidate" || fail "Admin candidate unexpectedly enabled automatic fallback"

printf 'Checking the native continuity route...\n'
native_preview="$(icp canister call teves_consulting_backend previewAionProviderRoute \
  '(variant {nativeContinuityPreview})' \
  -e local --query)"
grep -q 'providerId = "none"' <<<"$native_preview" || fail "Native continuity route selected a provider"
grep -q 'routeId = "native-continuity-preview"' <<<"$native_preview" || fail "Native continuity route identifier was incorrect"
grep -q 'invocationPermitted = false' <<<"$native_preview" || fail "Native continuity route permitted provider invocation"
grep -q 'automaticFallback = false' <<<"$native_preview" || fail "Native continuity route unexpectedly enabled automatic fallback"

after_summaries="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e local --query)"
after_feedback="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e local --query)"

[[ "$before_summaries" == "$after_summaries" ]] || fail "Route previews changed continuity summaries"
[[ "$before_feedback" == "$after_feedback" ]] || fail "Route previews changed feedback"

printf 'Provider route preview local smoke test passed.\n'
printf 'Admin candidate route:\n%s\n' "$candidate"
