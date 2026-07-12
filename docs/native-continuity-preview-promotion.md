# Native Continuity Preview Promotion

This runbook promotes Aion's first native read-only API:

previewMyContinuity(queryText)

It intentionally establishes the pattern for future native read-only capabilities: caller-scoped, bounded, explainable, reversible, and independently validated before broader use.

## Scope

The promotion adds one backward-compatible Candid query to teves_consulting_backend.

It does not:

- change existing memory records or relationships;
- change live retrieval or Python answer orchestration;
- invoke OpenAI, an ICP LLM canister, or any other provider;
- add HTTPS outcalls;
- change automatic routing or provider selection.

## Promotion Success Criteria

All of the following must be true before this promotion is considered complete:

- Existing public functionality remains available.
- Existing memories and feedback remain readable.
- Existing authenticated continuity remains intact.
- Existing clients remain Candid-compatible.
- previewMyContinuity returns only caller-scoped previews.
- Anonymous calls return unauthenticated.
- Whitespace-only input returns invalidQuery.
- The preview call makes no memory writes and no provider calls.
- The continuity indicator, delete-memory flow, Admin feedback tools, and public Aion conversation remain usable.

## Pre-Promotion Gate

Run the dedicated review from a clean, pushed worktree:

~~~bash
./scripts/review-continuity-preview-promotion.sh
~~~

Do not continue unless it reports success. The review proves the candidate is backward-compatible, adds only previewMyContinuity, and confirms that mainnet still has the existing baseline interface.

## Controlled Upgrade

Use the controller identity. Create a rollback snapshot before upgrading:

~~~bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"
icp canister start teves_consulting_backend -e ic
icp deploy teves_consulting_backend -e ic --mode upgrade
~~~

Do not pass --yes; retain the ICP CLI compatibility confirmation.

## Post-Upgrade Native API Checks

Confirm the canister is running:

~~~bash
icp canister status teves_consulting_backend -e ic
~~~

With an authenticated identity that owns continuity, confirm the preview is read-only:

~~~bash
BEFORE="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
PREVIEW="$(icp canister call teves_consulting_backend previewMyContinuity '("How should the Motoko backend deploy?")' -e ic --query)"
AFTER="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"

printf '%s\n' "$PREVIEW"
[[ "$BEFORE" == "$AFTER" ]]
~~~

The preview must return only the current caller's safe memory fields. The before-and-after summaries must be identical.

For the anonymous negative test, open the backend Candid UI in a signed-out private browser session and call previewMyContinuity with any valid text. It must return:

~~~text
variant { err = unauthenticated }
~~~

## Regression Checklist

Verify the following without deleting existing continuity:

- In aion.html, existing authenticated continuity remains visible and usable.
- The continuity indicator still reflects its state.
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

git commit -m "Record native continuity preview deployment"
git push

git tag -a phase7-native-preview -m "First native Aion continuity API"
git push origin phase7-native-preview
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
