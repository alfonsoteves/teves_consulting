#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

environment="${AION_DEPLOY_ENVIRONMENT:-ic}"
target="${1:-frontend}"

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-ic.sh [frontend|full]

Targets:
  frontend  Refresh and sync public frontend assets only. Default.
  full      Run backend preflight, upgrade backend, then deploy frontend.

Environment:
  AION_DEPLOY_ENVIRONMENT=ic      ICP environment to target.
  AION_ALLOW_DIRTY_DEPLOY=1       Allow deploying with uncommitted tracked changes.
EOF
}

fail() {
  printf 'Deployment stopped: %s\n' "$1" >&2
  exit 1
}

verify_clean_tree() {
  if [[ "${AION_ALLOW_DIRTY_DEPLOY:-}" == "1" ]]; then
    return
  fi

  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "tracked working tree changes are present. Commit first or set AION_ALLOW_DIRTY_DEPLOY=1."
}

verify_live_operator() {
  local body
  local script
  local operator_version="phase-9-model-evidence-split-20260802"
  local attempt
  local cache_buster

  for attempt in {1..12}; do
    cache_buster="${operator_version}-${attempt}-$(date +%s)"
    body="$(curl -L --max-time 30 -H 'Cache-Control: no-cache' -s "https://www.tevesconsulting.com/operator.html?deploy_check=${cache_buster}")"

    if [[ "$body" == *"src=\"/operator.js?v=${operator_version}\""* ]] &&
       [[ "$body" == *'primeHomeResults'* ]] &&
       [[ "$body" == *'Operator role activation surface start'* ]] &&
       [[ "$body" == *'role-activation-button'* ]] &&
       [[ "$body" != *'mirrorPanel'* ]] &&
       [[ "$body" != *'engineerPanel'* ]] &&
       [[ "$body" != *'validationPanel'* ]]; then
      script="$(curl -L --max-time 30 -H 'Cache-Control: no-cache' -s "https://www.tevesconsulting.com/operator.js?v=${cache_buster}")"

      if [[ "$script" == *'let primeConversationHistory = [];'* ]] &&
         [[ "$script" != *'\nlet primeConversationHistory'* ]] &&
         [[ "$script" == *'document.getElementById("authButton").addEventListener("click", handleAuth);'* ]] &&
         [[ "$script" == *'Ask Mirror'* ]] &&
         [[ "$script" == *'Ask Engineer'* ]] &&
         [[ "$script" == *'role-activation-button'* ]] &&
         [[ "$script" == *'Mirror context'* ]] &&
         [[ "$script" == *'acceptedDecisionCount'* ]] &&
         [[ "$script" == *'Configured/requested model'* ]] &&
         [[ "$script" == *'Returned runtime model'* ]] &&
         [[ "$script" == *'mirrorReviewPacket'* ]] &&
         [[ "$script" == *'Boundary confirmed'* ]] &&
         [[ "$script" == *'Insufficiency notes'* ]]; then
        return
      fi
    fi

    echo "Production Operator assets are not fully refreshed yet; retrying (${attempt}/12)..."
    sleep 10
  done

  fail "production /operator.html or /operator.js did not refresh to the Operator role activation workspace after retries"
}

deploy_frontend() {
  scripts/prepare-frontend-assets.sh

  echo "Syncing frontend assets..."
  icp sync teves_consulting_frontend -e "$environment"

  echo "Verifying production operator page..."
  verify_live_operator

  echo "Frontend deployment complete."
  echo "https://www.tevesconsulting.com/operator.html"
}

deploy_full() {
  scripts/prepare-frontend-assets.sh

  echo "Running backend preflight..."
  scripts/preflight-motoko-backend-upgrade.sh

  echo "Building project..."
  icp build

  echo "Deploying backend..."
  icp deploy teves_consulting_backend -e "$environment" --mode upgrade --yes

  echo "Deploying frontend..."
  if ! frontend_deploy_output="$(icp deploy teves_consulting_frontend -e "$environment" --mode upgrade 2>&1)"; then
    printf '%s\n' "$frontend_deploy_output" >&2

    if [[ "$frontend_deploy_output" == *"IC0508"* && "$frontend_deploy_output" == *"is stopped"* ]]; then
      echo "Frontend install completed before asset sync; starting and synchronizing assets..."
      icp canister start teves_consulting_frontend -e "$environment"
      icp sync teves_consulting_frontend -e "$environment"
    else
      exit 1
    fi
  else
    printf '%s\n' "$frontend_deploy_output"
  fi

  echo "Verifying production operator page..."
  verify_live_operator

  echo "Full deployment complete."
}

case "$target" in
  frontend)
    verify_clean_tree
    deploy_frontend
    ;;
  full)
    verify_clean_tree
    deploy_full
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    fail "unknown target: $target"
    ;;
esac
