# Operator Authorization Promotion

This runbook promotes Phase 7.76's Motoko operator-authorization foundation.

It establishes one reviewed production Internet Identity principal as the initial
operator allowlist. No recovery principal is configured in this promotion.

## Scope

The backend adds `getOperatorStatus()`, which reports status only for the
authenticated caller. It accepts no principal argument and returns no allowlist
principal.

The backend also restricts these aggregate feedback reads to the configured
operator:

- `getFeedbackCount()`;
- `getFeedbackEntries()`;
- `getRecentFeedback()`.

It does not restrict public feedback submission, caller-owned memory storage,
caller-owned memory reads or deletion, continuity previews, provider-policy
evidence, or public Aion answers.

## Promotion Success Criteria

- Existing public functionality remains available.
- Existing memories remain readable and deletable by their owners.
- Existing feedback submission remains available.
- Existing authenticated continuity remains caller-scoped and read-only.
- Existing clients remain Candid-compatible.
- `getOperatorStatus()` reports one configured operator and no recovery
  principal.
- The production Internet Identity operator can read aggregate feedback through
  the authenticated Admin interface.
- An anonymous, ordinary authenticated, or controller-only caller cannot read
  aggregate feedback.
- No provider calls, HTTPS outcalls, memory writes, routing changes, or
  automatic fallback are introduced.

## Pre-Promotion Review

Run the dedicated review from a clean, pushed worktree:

```bash
./scripts/review-operator-authorization-promotion.sh
```

It proves that the candidate adds only `getOperatorStatus()` to Candid, keeps
the existing service methods, and confirms mainnet remains on the pre-operator
baseline. It does not create a snapshot or upgrade a canister.

## Controlled Upgrade

Use the controller identity to create a rollback snapshot, then upgrade:

```bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
icp canister start teves_consulting_backend -e ic
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"

icp deploy teves_consulting_backend -e ic --mode upgrade
icp canister status teves_consulting_backend -e ic
```

## Post-Upgrade Checks

The command-line controller is deliberately not the production Internet
Identity operator. Confirm that it can see its own denied status and cannot
read aggregate feedback:

```bash
STATUS="$(icp canister call teves_consulting_backend getOperatorStatus '()' -e ic --query)"
printf '%s\n' "$STATUS"
grep -q 'isOperator = false' <<<"$STATUS"
grep -q 'allowlistConfigured = true' <<<"$STATUS"
grep -q 'recoveryConfigured = false' <<<"$STATUS"
grep -q 'operatorCount = 1' <<<"$STATUS"

if icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query; then
  printf 'Expected the controller-only caller to be denied aggregate feedback access.\n' >&2
  exit 1
fi
```

Then sign in to `admin.html` with the reviewed production Internet Identity and
confirm that its feedback metrics and feedback entries load. The Admin gate in
Phase 7.77 will make this access boundary visible in the page itself.

Finally confirm ordinary Aion behavior remains intact:

- authenticated continuity remains visible in `aion.html`;
- a public Aion conversation still uses the OpenAI production answer path;
- feedback submission still succeeds;
- caller-owned memory listing and deletion remain available to their owner.

## Record The Deployment

After the checks pass, capture the new Candid and stable-type baselines:

```bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \\
  deployed/teves_consulting_backend.did \\
  deployed/teves_consulting_backend.most

git commit -m "Record operator authorization deployment"
git push
```

Keep the snapshot identifier until the deployment record and regression checks
are complete. If a regression appears, stop the canister, restore that snapshot,
start it again, and confirm its status.
