#!/usr/bin/env bash
set -euo pipefail

if [[ "${AION_CONFIRM_RESET:-}" != "DELETE_ALL_DATA" ]]; then
  echo "This will reinstall the backend canister and delete all ICP backend data."
  echo "That includes old memories, new memories, feedback, and counters."
  echo
  echo "Run again with:"
  echo "  AION_CONFIRM_RESET=DELETE_ALL_DATA scripts/reset-ic.sh"
  exit 1
fi

echo "Preparing frontend assets..."
rm -rf site_dist

rsync -av \
  --exclude dist \
  --exclude src \
  --exclude .DS_Store \
  src/teves_consulting_frontend/ \
  site_dist/

echo "Building project..."
icp build

echo "Reinstalling backend and deleting backend stable data..."
icp deploy teves_consulting_backend -e ic --mode reinstall --yes

echo "Deploying frontend..."
icp deploy teves_consulting_frontend -e ic --mode upgrade

echo "Reset deployment complete."
