#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"
SECONDARY_IDENTITY="phase7-preview-other-$(date +%s)"
SECONDARY_CREATED=false

fail() {
  printf 'Continuity preview local smoke test failed: %s\n' "$1" >&2
  exit 1
}

cleanup_note() {
  if [[ "$SECONDARY_CREATED" == true ]]; then
    printf 'Local cleanup: icp canister stop teves_consulting_backend -e local && icp canister delete teves_consulting_backend -e local && icp network stop && icp identity delete %s && rm -f .icp/data/mappings/local.ids.json\n' "$SECONDARY_IDENTITY"
  fi
}
trap cleanup_note EXIT

[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this smoke test."

cd "$PROJECT_ROOT"

printf 'Building the native continuity preview backend locally...\n'
icp build teves_consulting_backend
[[ -f "$BACKEND_WASM" ]] || fail "Backend WASM was not produced"

printf 'Starting an isolated local ICP network...\n'
icp network start -d

printf 'Creating and installing the local backend...\n'
icp canister create teves_consulting_backend -e local
icp canister install teves_consulting_backend -e local --mode install --wasm "$BACKEND_WASM"

printf 'Creating a disposable second local identity...\n'
icp identity new "$SECONDARY_IDENTITY" --storage plaintext >/dev/null
SECONDARY_CREATED=true

printf 'Writing one continuity summary for each local identity...\n'
icp canister call teves_consulting_backend storeSummary \
  '("Owner A local continuity", "Owner A Motoko context must remain caller-scoped.", vec {"continuity"; "motoko"}, vec {"motoko"; "backend"}, vec {"Keep previews owner-scoped."}, vec {}, false, 7, "technical", "phase7-local-owner-a", 92, "active")' \
  -e local >/dev/null

icp canister call teves_consulting_backend storeSummary \
  '("Owner B local continuity", "Owner B context must never appear for a different caller.", vec {"continuity"; "privacy"}, vec {"privacy"; "backend"}, vec {"Keep user records separate."}, vec {}, false, 7, "technical", "phase7-local-owner-b", 92, "active")' \
  -e local --identity "$SECONDARY_IDENTITY" >/dev/null

printf 'Checking the default identity preview...\n'
owner_a_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '("How should the Motoko backend deploy?")' \
  -e local --query)"

grep -q 'Owner A local continuity' <<<"$owner_a_preview" || fail "Default identity preview omitted its own summary"
if grep -q 'Owner B local continuity' <<<"$owner_a_preview"; then
  fail "Default identity preview exposed the second identity's summary"
fi

printf 'Checking the second identity preview...\n'
owner_b_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '("How should the Motoko backend deploy?")' \
  -e local --query --identity "$SECONDARY_IDENTITY")"

grep -q 'Owner B local continuity' <<<"$owner_b_preview" || fail "Second identity preview omitted its own summary"
if grep -q 'Owner A local continuity' <<<"$owner_b_preview"; then
  fail "Second identity preview exposed the default identity's summary"
fi

printf 'Checking invalid-query behavior...\n'
invalid_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '(" \n\t\r ")' \
  -e local --query)"

grep -q 'invalidQuery' <<<"$invalid_preview" || fail "Whitespace-only query did not return invalidQuery"

printf 'Local continuity preview smoke test passed.\n'
printf 'Default identity preview:\n%s\n' "$owner_a_preview"
