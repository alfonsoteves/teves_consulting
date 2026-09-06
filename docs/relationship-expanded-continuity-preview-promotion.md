# Relationship-Expanded Continuity Preview Promotion

This runbook promotes the second native Aion continuity capability: bounded relationship-expanded memories in the existing `previewMyContinuity(queryText)` response.

The API shape remains the same. The promotion adds the safe `expandedMemories` response field alongside `rankedMemories`.

## Scope

The promotion adds at most two active, intent-compatible related memories after the primary ranked selection.

It does not:

- change stored memories or relationships;
- alter the primary ranked selection;
- change live Python retrieval or answer orchestration;
- invoke OpenAI, an ICP LLM canister, or any other provider;
- add HTTPS outcalls;
- change automatic routing or provider selection.

## Promotion Success Criteria

All of the following must be true before this promotion is considered complete:

- Existing public functionality remains available.
- Existing memories and feedback remain readable.
- Existing authenticated continuity remains intact.
- Existing clients remain Candid-compatible.
- `previewMyContinuity` keeps its current method name and caller-scoped behavior.
- `expandedMemories` contains only active, caller-owned, bounded related memories.
- `expandedMemories` contains no more than two entries.
- The primary `rankedMemories` selection remains separate from the expanded list.
- Anonymous calls return `unauthenticated`.
- Whitespace-only input returns `invalidQuery`.
- The preview call makes no memory writes and no provider calls.
- The continuity indicator, delete-memory flow, Admin feedback tools, and public Aion conversation remain usable.

## Pre-Promotion Gate

Run the dedicated review from a clean, pushed worktree:

~~~bash
./scripts/review-relationship-expanded-preview-promotion.sh
~~~

Do not continue unless it reports success. The review proves the candidate is backward-compatible, preserves the public method set, adds only `expandedMemories`, and confirms that mainnet still has the previous native preview baseline.

The local two-identity smoke test must already have passed:

~~~bash
./scripts/smoke-relationship-expanded-preview-local.sh
~~~

## Controlled Upgrade

Use the controller identity. Create a rollback snapshot before upgrading:

~~~bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"
icp canister start teves_consulting_backend -e ic
icp deploy teves_consulting_backend -e ic --mode upgrade
~~~

Do not pass `--yes`; retain the ICP CLI compatibility confirmation.

## Post-Upgrade Native API Checks

Confirm the canister is running:

~~~bash
icp canister status teves_consulting_backend -e ic
~~~

With an authenticated identity that owns continuity, confirm the preview remains read-only and exposes the new response field:

~~~bash
BEFORE="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
PREVIEW="$(icp canister call teves_consulting_backend previewMyContinuity '("How should the Motoko backend deploy?")' -e ic --query)"
AFTER="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"

printf '%s\n' "$PREVIEW"
grep -q 'expandedMemories' <<<"$PREVIEW"
[[ "$BEFORE" == "$AFTER" ]]
~~~

The preview must return only safe caller-scoped memory fields. The before-and-after summaries must be identical. An empty expanded vector is valid when the authenticated caller has no matching related memory.

For the anonymous negative test, open the backend Candid UI in a signed-out private browser session and call `previewMyContinuity` with valid text. It must return:

~~~text
variant { err = unauthenticated }
~~~

## Regression Checklist

Verify the following without deleting existing continuity:

- In `aion.html`, existing authenticated continuity remains visible and usable.
- The continuity indicator still reflects the existing state.
- The delete-memory confirmation flow is present; use only a disposable identity if a destructive deletion test is needed.
- Admin feedback tools still load.
- A normal public Aion conversation still receives a response.

## Archive And Tag

After all checks pass, capture the deployed baseline and record this milestone:

~~~bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \
  deployed/teves_consulting_backend.did \
  deployed/teves_consulting_backend.most

git commit -m "Record relationship-expanded preview deployment"
git push

git tag -a phase7-relationship-expanded-preview -m "Native Aion relationship-expanded continuity preview"
git push origin phase7-relationship-expanded-preview
~~~

Keep the rollback snapshot until the post-upgrade checks and baseline capture are complete.

## Rollback

If the backend becomes unavailable or continuity regresses, restore the recorded snapshot:

~~~bash
icp canister stop teves_consulting_backend -e ic
icp canister snapshot restore teves_consulting_backend "$SNAPSHOT_ID" -e ic
icp canister start teves_consulting_backend -e ic
icp canister status teves_consulting_backend -e ic
~~~
