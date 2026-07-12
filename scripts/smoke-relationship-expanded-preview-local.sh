#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
BACKEND_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"
SECONDARY_IDENTITY="phase7-expanded-preview-other-$(date +%s)"
SECONDARY_CREATED=false

fail() {
  printf 'Relationship-expanded continuity preview smoke test failed: %s\n' "$1" >&2
  exit 1
}

cleanup_note() {
  if [[ "$SECONDARY_CREATED" == true ]]; then
    printf 'Local cleanup: icp canister stop teves_consulting_backend -e local && icp canister delete teves_consulting_backend -e local && icp network stop && icp identity delete %s && rm -f .icp/data/mappings/local.ids.json\n' "$SECONDARY_IDENTITY"
  fi
}
trap cleanup_note EXIT

store_default() {
  icp canister call teves_consulting_backend storeSummary "$1" -e local >/dev/null
}

[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this smoke test."

cd "$PROJECT_ROOT"

printf 'Building the relationship-expanded preview backend locally...\n'
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

printf 'Writing six continuity summaries for the default local identity...\n'
store_default '("Selected backend source", "General continuity fixture.", vec {}, vec {}, vec {}, vec {record {subject = "backend"; predicate = "supports"; target = "release"; category = "fixture"}}, false, 10, "session", "phase7-expanded-source", 90, "active")'
store_default '("Ranked filler one", "General continuity fixture.", vec {}, vec {}, vec {}, vec {}, false, 9, "session", "phase7-expanded-filler-1", 90, "active")'
store_default '("Ranked filler two", "General continuity fixture.", vec {}, vec {}, vec {}, vec {}, false, 8, "session", "phase7-expanded-filler-2", 90, "active")'
store_default '("Ranked filler three", "General continuity fixture.", vec {}, vec {}, vec {}, vec {}, false, 7, "session", "phase7-expanded-filler-3", 90, "active")'
store_default '("Ranked filler four", "General continuity fixture.", vec {}, vec {}, vec {}, vec {}, false, 6, "session", "phase7-expanded-filler-4", 90, "active")'
store_default '("Related backend candidate", "General continuity fixture.", vec {}, vec {}, vec {}, vec {record {subject = "backend"; predicate = "supports"; target = "support"; category = "fixture"}}, false, 1, "session", "phase7-expanded-related", 90, "active")'

printf 'Writing one linked summary for the second local identity...\n'
icp canister call teves_consulting_backend storeSummary \
  '("Other owner backend candidate", "This related record must remain private.", vec {}, vec {}, vec {}, vec {record {subject = "backend"; predicate = "supports"; target = "release"; category = "fixture"}}, false, 20, "session", "phase7-expanded-other-owner", 90, "active")' \
  -e local --identity "$SECONDARY_IDENTITY" >/dev/null

printf 'Checking the default identity relationship-expanded preview...\n'
owner_a_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '("General continuity")' \
  -e local --query)"

grep -q 'memoryCount = 6' <<<"$owner_a_preview" || fail "Default identity did not receive its six summaries"
grep -q 'expandedMemories = vec {' <<<"$owner_a_preview" || fail "Default identity did not receive an expanded memory"
grep -q 'Related backend candidate' <<<"$owner_a_preview" || fail "Related candidate was not returned"
grep -q 'Relationship-expanded memories' <<<"$owner_a_preview" || fail "Context preview did not label relationship-expanded memories"
if grep -q 'Other owner backend candidate' <<<"$owner_a_preview"; then
  fail "Default identity preview exposed the second identity's memory"
fi

printf 'Checking the second identity preview...\n'
owner_b_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '("General continuity")' \
  -e local --query --identity "$SECONDARY_IDENTITY")"

grep -q 'memoryCount = 1' <<<"$owner_b_preview" || fail "Second identity did not receive its own summary"
grep -q 'Other owner backend candidate' <<<"$owner_b_preview" || fail "Second identity preview omitted its own summary"
grep -q 'expandedMemories = vec {}' <<<"$owner_b_preview" || fail "Second identity unexpectedly received expanded memories"
if grep -q 'Selected backend source' <<<"$owner_b_preview"; then
  fail "Second identity preview exposed the default identity's memory"
fi

printf 'Checking invalid-query behavior...\n'
invalid_preview="$(icp canister call teves_consulting_backend previewMyContinuity \
  '(" \n\t\r ")' \
  -e local --query)"

grep -q 'invalidQuery' <<<"$invalid_preview" || fail "Whitespace-only query did not return invalidQuery"

printf 'Relationship-expanded continuity preview local smoke test passed.\n'
printf 'Default identity preview:\n%s\n' "$owner_a_preview"
