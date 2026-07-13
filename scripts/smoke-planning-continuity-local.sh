#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"

fail() {
  printf 'Planning continuity smoke test failed: %s\n' "$1" >&2
  exit 1
}

cleanup_note() {
  printf 'Local cleanup: icp canister stop teves_consulting_backend -e local && icp canister delete teves_consulting_backend -e local && icp network stop && rm -f .icp/data/mappings/local.ids.json\n'
}
trap cleanup_note EXIT

store_summary() {
  icp canister call teves_consulting_backend storeSummary "$1" -e local >/dev/null
}

[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this smoke test."

cd "$PROJECT_ROOT"

printf 'Building the planning continuity backend locally...\n'
icp build teves_consulting_backend
[[ -f "$BACKEND_WASM" ]] || fail "Backend WASM was not produced"

printf 'Starting an isolated local ICP network...\n'
icp network start -d

printf 'Creating and installing the local backend...\n'
icp canister create teves_consulting_backend -e local
icp canister install teves_consulting_backend -e local --mode install --wasm "$BACKEND_WASM"

printf 'Writing identity, project, and decision continuity summaries...\n'
store_summary '("Aion identity", "Aion supports the operator continuity.", vec {"identity"}, vec {}, vec {}, vec {}, false, 4, "identity", "planning-smoke-identity", 95, "active")'
store_summary '("Phase seven native continuity", "Complete the native continuity shadow window before cutover.", vec {"phase"; "continuity"}, vec {}, vec {"Use a bounded shadow window before promotion."}, vec {}, true, 5, "project", "planning-smoke-project", 92, "active")'
store_summary '("Cutover decision", "Do not cut over until operator-reviewed shadow evidence is complete.", vec {"decision"; "cutover"}, vec {}, vec {"Require explicit operator approval."}, vec {}, false, 4, "decision", "planning-smoke-decision", 88, "active")'

printf 'Checking the planning continuity preview...\n'
preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '("What is the next action for Aion?")' \
  -e local --query)"

grep -q 'memoryCount = 3' <<<"$preview" || fail "Planning preview did not include all local summaries"
grep -q 'queryIntent = "planning"' <<<"$preview" || fail "Planning query was not classified as planning"
grep -q 'Phase seven native continuity' <<<"$preview" || fail "Planning preview omitted the current project milestone"
grep -q 'Cutover decision' <<<"$preview" || fail "Planning preview omitted the cutover decision"

project_line="$(grep -n -m1 'title = "Phase seven native continuity"' <<<"$preview" | cut -d: -f1)"
identity_line="$(grep -n -m1 'title = "Aion identity"' <<<"$preview" | cut -d: -f1)"
[[ -n "$project_line" && -n "$identity_line" ]] || fail "Ranked preview titles were not readable"
(( project_line < identity_line )) || fail "Identity continuity outranked the current project milestone for a planning query"

printf 'Planning continuity local smoke test passed.\n'
printf 'Preview:\n%s\n' "$preview"
