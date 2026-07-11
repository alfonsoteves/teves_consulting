#!/usr/bin/env bash
set -euo pipefail

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

echo "Deploying backend..."
icp deploy teves_consulting_backend -e ic --mode upgrade --yes

echo "Deploying frontend..."
if ! frontend_deploy_output="$(icp deploy teves_consulting_frontend -e ic --mode upgrade 2>&1)"; then
  printf '%s\n' "$frontend_deploy_output" >&2

  if [[ "$frontend_deploy_output" == *"IC0508"* && "$frontend_deploy_output" == *"is stopped"* ]]; then
    echo "Frontend install completed before asset sync; starting and synchronizing assets..."
    icp canister start teves_consulting_frontend -e ic
    icp sync teves_consulting_frontend -e ic
  else
    exit 1
  fi
else
  printf '%s\n' "$frontend_deploy_output"
fi

echo "Deployment complete."
