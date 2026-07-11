#!/usr/bin/env bash
set -euo pipefail

readonly BACKEND_CANISTER="teves_consulting_backend"
readonly ENVIRONMENT="ic"
readonly OUTPUT_DIR="deployed"
readonly CANDID_FILE="${OUTPUT_DIR}/teves_consulting_backend.did"
readonly BASELINE_FILE="${OUTPUT_DIR}/teves_consulting_backend.baseline.json"

mkdir -p "$OUTPUT_DIR"

source_revision="$(git rev-parse HEAD)"
captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
temporary_candid="$(mktemp "${OUTPUT_DIR}/.teves_consulting_backend.did.XXXXXX")"

cleanup() {
  rm -f "$temporary_candid"
}
trap cleanup EXIT

echo "Capturing live backend Candid metadata..."
icp canister metadata "$BACKEND_CANISTER" candid:service -e "$ENVIRONMENT" > "$temporary_candid"

if [[ ! -s "$temporary_candid" ]]; then
  echo "Candid metadata capture returned no content." >&2
  exit 1
fi

mv "$temporary_candid" "$CANDID_FILE"

cat > "$BASELINE_FILE" <<EOF
{
  "backendCanister": "$BACKEND_CANISTER",
  "environment": "$ENVIRONMENT",
  "sourceRevision": "$source_revision",
  "capturedAtUtc": "$captured_at",
  "candidFile": "teves_consulting_backend.did",
  "captureMode": "read-only candid metadata"
}
EOF

echo "Baseline captured:"
echo "  $CANDID_FILE"
echo "  $BASELINE_FILE"
