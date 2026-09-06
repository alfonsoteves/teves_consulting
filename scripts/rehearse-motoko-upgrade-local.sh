#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_SOURCE_ROOT="${AION_LEGACY_SOURCE_ROOT:-"$PROJECT_ROOT/../teves_consulting"}"
LEGACY_MAIN="$LEGACY_SOURCE_ROOT/src/teves_consulting_backend/main.mo"
LEGACY_BASE="$LEGACY_SOURCE_ROOT/.mops/base@0.14.14/src"
LOCAL_MAPPING="$PROJECT_ROOT/.icp/data/mappings/local.ids.json"
MODERN_WASM="$PROJECT_ROOT/.mops/.build/teves_consulting_backend.wasm"
LEGACY_WASM="$(mktemp "${TMPDIR:-/tmp}/teves_consulting_backend_legacy.XXXXXX.wasm")"

cleanup() {
  rm -f "$LEGACY_WASM"
}
trap cleanup EXIT

fail() {
  printf 'Upgrade rehearsal failed: %s\n' "$1" >&2
  exit 1
}

[[ -f "$LEGACY_MAIN" ]] || fail "Legacy backend source was not found at $LEGACY_MAIN"
[[ -d "$LEGACY_BASE" ]] || fail "Legacy mo:base source was not found at $LEGACY_BASE"
[[ ! -e "$LOCAL_MAPPING" ]] || fail "A local mapping already exists. Use a clean local network before this rehearsal."

LEGACY_MOC="$(cd "$LEGACY_SOURCE_ROOT" && mops toolchain bin moc)"

printf 'Building the legacy backend locally...\n'
"$LEGACY_MOC" -c \
  --package base "$LEGACY_BASE" \
  "$LEGACY_MAIN" \
  --public-metadata candid:service \
  --stable-types \
  -o "$LEGACY_WASM"

printf 'Starting an isolated local ICP network...\n'
cd "$PROJECT_ROOT"
icp network start -d

printf 'Creating the local rehearsal canister...\n'
icp canister create teves_consulting_backend -e local

printf 'Installing legacy state layout...\n'
icp canister install teves_consulting_backend -e local --mode install --wasm "$LEGACY_WASM"

printf 'Writing legacy sample state...\n'
icp canister call teves_consulting_backend addFeedback \
  '("up", "legacy-upgrade-feedback", "legacy answer", "2026-07-11")' \
  -e local >/dev/null
icp canister call teves_consulting_backend storeSummary \
  '("Upgrade rehearsal", "legacy-upgrade-memory", vec {"continuity"}, vec {"phase7"}, vec {"state-survives"}, vec {record {subject = "Aion"; predicate = "tests"; target = "upgrade"; category = "rehearsal"}}, true, 5, "test", "phase7-upgrade-rehearsal", 100, "active")' \
  -e local >/dev/null

feedback_before="$(icp canister call teves_consulting_backend getFeedbackEntries '()' -e local --query)"
summaries_before="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e local --query)"
grep -q 'legacy-upgrade-feedback' <<<"$feedback_before" || fail "Legacy feedback was not readable before upgrade"
grep -q 'legacy-upgrade-memory' <<<"$summaries_before" || fail "Legacy memory was not readable before upgrade"

printf 'Building and upgrading to the modern backend...\n'
icp build teves_consulting_backend
[[ -f "$MODERN_WASM" ]] || fail "Modern backend WASM was not produced"
icp canister install teves_consulting_backend -e local --mode upgrade --wasm "$MODERN_WASM"

feedback_after="$(icp canister call teves_consulting_backend getFeedbackEntries '()' -e local --query)"
summaries_after="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e local --query)"

[[ "$feedback_before" == "$feedback_after" ]] || fail "Feedback changed across the upgrade"
[[ "$summaries_before" == "$summaries_after" ]] || fail "Memory summaries changed across the upgrade"

printf 'Upgrade rehearsal passed. Legacy feedback and memory summaries survived the local upgrade.\n'
printf 'Local cleanup remains manual: icp canister delete teves_consulting_backend -e local && icp network stop\n'
