#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

echo "Preparing frontend assets..."
rsync -a --delete --delete-excluded \
  --exclude="dist/" \
  --exclude="src/" \
  --exclude=".DS_Store" \
  src/teves_consulting_frontend/ \
  site_dist/
