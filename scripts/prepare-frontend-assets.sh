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

echo "Verifying generated frontend assets..."
require_present() {
  local needle="$1"
  local file="$2"

  if ! grep -Fq "$needle" "$file"; then
    echo "Generated asset check failed: expected '$needle' in $file." >&2
    exit 1
  fi
}

require_absent() {
  local needle="$1"
  local file="$2"

  if grep -Fq "$needle" "$file"; then
    echo "Generated asset check failed: stale '$needle' found in $file." >&2
    exit 1
  fi
}

require_identical() {
  local source_file="$1"
  local generated_file="$2"

  if ! cmp -s "$source_file" "$generated_file"; then
    echo "Generated asset check failed: $generated_file differs from $source_file." >&2
    exit 1
  fi
}

test -f site_dist/admin.html
test -f site_dist/admin.js
test -f site_dist/operator.html
test -f site_dist/operator.js
require_identical src/teves_consulting_frontend/admin.html site_dist/admin.html
require_identical src/teves_consulting_frontend/admin.js site_dist/admin.js
require_identical src/teves_consulting_frontend/operator.html site_dist/operator.html
require_identical src/teves_consulting_frontend/operator.js site_dist/operator.js
node --check site_dist/admin.js
node --check site_dist/operator.js
require_present 'src="./admin.js"' site_dist/admin.html
require_present 'src="/operator.js?v=phase-9-model-evidence-split-20260802"' site_dist/operator.html
require_present 'primeHomeResults' site_dist/operator.html
require_present 'Operator role activation surface start' site_dist/operator.html
require_present 'role-activation-button' site_dist/operator.html
require_present 'renderRoleActivationWorkspace' site_dist/operator.js
require_present 'Ask Mirror' site_dist/operator.js
require_present 'Ask Engineer' site_dist/operator.js
require_present 'let primeConversationHistory = [];' site_dist/operator.js
require_present 'let mirrorConversationHistory = [];' site_dist/operator.js
require_present 'let engineerConversationHistory = [];' site_dist/operator.js
require_present 'Mirror context' site_dist/operator.js
require_present 'acceptedDecisionCount' site_dist/operator.js
require_present 'Configured/requested model' site_dist/operator.js
require_present 'Returned runtime model' site_dist/operator.js
require_present 'Insufficiency notes' site_dist/operator.js
require_present 'document.getElementById("authButton").addEventListener("click", handleAuth);' site_dist/operator.js
require_present 'engineerWorkflowHasActiveWork' site_dist/operator.js
require_present 'engineerApprovalPanelHtml' site_dist/operator.js
require_present 'engineerTraceHtml' site_dist/operator.js
require_present 'engineerSteeringHtml' site_dist/operator.js
require_present 'engineerSessionLimitsHtml' site_dist/operator.js
require_present 'resetEngineerWorkflowForFreshObjective' site_dist/operator.js
require_present 'execution_scope_change' site_dist/operator.js
require_present 'renderPostNoBody(engineerApprovalPath("approve"))' site_dist/operator.js
require_present 'renderPostNoBody(engineerApprovalPath("deny"))' site_dist/operator.js
require_present 'renderPostNoBody(engineerApprovalPath("resume"))' site_dist/operator.js
require_present 'Operator workspace' site_dist/admin.html
require_present 'Open recommended action' site_dist/admin.html
require_present 'Copy recommended actions' site_dist/admin.html
require_present 'advanced-operator-tool' site_dist/admin.html
require_present 'Aion Operator Recommended Actions' site_dist/admin.js
require_present 'Scope: dashboard guidance only; copying this does not execute an action.' site_dist/admin.js
require_present 'No deploy command included' site_dist/admin.js
require_absent 'Good morning Alfonso' site_dist/operator.js
require_absent 'Phase 9 flexible role activation' site_dist/operator.js
require_absent 'Choose a role or continue the current Aion objective' site_dist/operator.js
require_absent 'Start Decision Review' site_dist/operator.html
require_absent 'Start Decision Review' site_dist/operator.js
require_absent 'No active read approval' site_dist/operator.js
require_absent 'Requests for repository evidence will ask for your approval here.' site_dist/operator.js
require_absent 'Engineer is ready. Requests for repository evidence' site_dist/operator.js
if grep -Fq '\nlet primeConversationHistory' site_dist/operator.js; then
  echo "Generated Operator script still contains the literal backslash-n token." >&2
  exit 1
fi
