# Operator Session Grant Promotion

This runbook promotes the dormant Phase 7.77 operator-session grant foundation.

The new canister methods support a later authenticated Render session exchange.
They do not yet change the Admin page or protect Render endpoints by themselves.

## Scope

`issueOperatorSessionGrant(blob)` accepts only a 32-byte nonce from the
authenticated allowlisted operator. The canister stores only a SHA-256 digest,
expires it after five minutes, and bounds active grants.

`redeemOperatorSessionGrant(blob)` consumes a matching active grant once. It
accepts no principal and returns only a boolean result.

The raw nonce is never persisted. This promotion does not introduce provider
calls, HTTPS outcalls, memory writes, continuity changes, or public-answer
routing changes.

## Promotion Success Criteria

- Existing public functionality and caller-owned memory behavior remain intact.
- Existing feedback submission remains available.
- Existing authenticated continuity remains caller-scoped and read-only.
- Existing clients remain Candid-compatible.
- Only the allowlisted authenticated operator can issue a grant.
- A malformed, duplicate, expired, or redeemed grant cannot be redeemed.
- Grants are stored as digests and expire after five minutes.
- No Render endpoint is enforced by this promotion.

## Pre-Promotion Review

From a clean, pushed worktree, run:

```bash
./scripts/review-operator-session-grant-promotion.sh
```

The review proves the candidate adds exactly two grant methods and that the
live backend is still on the operator-authorization baseline.

## Controlled Upgrade

```bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
icp canister start teves_consulting_backend -e ic
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"

icp deploy teves_consulting_backend -e ic --mode upgrade
icp canister status teves_consulting_backend -e ic
```

## Post-Upgrade Checks

The command-line controller is not the configured Internet Identity operator.
It must be unable to issue a grant:

```bash
STATUS="$(icp canister call teves_consulting_backend getOperatorStatus '()' -e ic --query)"
printf '%s\n' "$STATUS"
grep -q 'isOperator = false' <<<"$STATUS"

if icp canister call teves_consulting_backend issueOperatorSessionGrant \
  '(blob "01234567890123456789012345678901")' -e ic; then
  printf 'Unexpected controller access to operator grant issuance.\n' >&2
  exit 1
fi

REDEEMED="$(icp canister call teves_consulting_backend redeemOperatorSessionGrant \
  '(blob "01234567890123456789012345678901")' -e ic)"
printf '%s\n' "$REDEEMED"
grep -q 'false' <<<"$REDEEMED"
```

Then confirm the existing signed-in Admin feedback dashboard and public Aion
conversation still work. No browser grant-exchange control exists until the
following Render and Admin integration promotion.

## Record The Deployment

```bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \\
  deployed/teves_consulting_backend.did \\
