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
icp deploy teves_consulting_frontend -e ic --mode upgrade

echo "Deployment complete."

