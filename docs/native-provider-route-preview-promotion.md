# Native Provider Route Preview Promotion

This runbook promotes Aion's native read-only provider-policy API:

`previewAionProviderRoute(operation)`

It establishes the pattern for native policy selection without native model inference. The method reports a fixed routing decision for a fixed operation type. It does not accept prompts, continuity, or provider payloads, and it cannot invoke a provider.

## Scope

The promotion adds one backward-compatible Candid query to `teves_consulting_backend`.

It reports these fixed decisions:

- `publicAnswer` reports the approved OpenAI production baseline.
- `adminCandidateEvaluation` reports the Admin-only ICP LLM candidate route.
- `nativeContinuityPreview` reports a provider-free native route.

It does not:

- change public Aion answer routing;
- invoke OpenAI, an ICP LLM canister, or any other provider;
- add HTTPS outcalls;
- accept, retrieve, write, or expose continuity memory;
- enable automatic provider fallback or switching;
- change live Python answer orchestration.

## Promotion Success Criteria

All of the following must be true before this promotion is considered complete:

- Existing public functionality remains available.
- Existing memories and feedback remain readable.
- Existing authenticated continuity remains intact.
- Existing clients remain Candid-compatible.
- `previewMyContinuity` keeps its existing caller-scoped behavior.
- `previewAionProviderRoute(publicAnswer)` reports OpenAI with automatic fallback disabled.
- `previewAionProviderRoute(adminCandidateEvaluation)` reports the ICP candidate with explicit operator action and promotion required.
- `previewAionProviderRoute(nativeContinuityPreview)` reports no provider and provider invocation disabled.
- The route-preview calls make no memory writes or feedback writes.
- No provider call occurs, and no user-facing routing changes.
- The continuity indicator, delete-memory flow, Admin tools, and public Aion conversation remain usable.

## Pre-Promotion Gate

Run the dedicated review from a clean, pushed worktree:

~~~bash
./scripts/review-provider-route-preview-promotion.sh
~~~

Do not continue unless it reports success. The review proves the candidate is backward-compatible, adds only `previewAionProviderRoute`, and confirms that mainnet still has the relationship-expanded continuity preview baseline.

The local route-preview smoke test must already have passed:

~~~bash
bash scripts/smoke-provider-route-preview-local.sh
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

With the controller identity, verify all three fixed decisions and confirm that no stored summaries or feedback changed:

~~~bash
BEFORE_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
BEFORE_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

PUBLIC_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {publicAnswer})' -e ic --query)"
CANDIDATE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {adminCandidateEvaluation})' -e ic --query)"
NATIVE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {nativeContinuityPreview})' -e ic --query)"

AFTER_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
AFTER_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

printf '%s\n%s\n%s\n' "$PUBLIC_ROUTE" "$CANDIDATE_ROUTE" "$NATIVE_ROUTE"
grep -q 'providerId = "openai"' <<<"$PUBLIC_ROUTE"
grep -q 'automaticFallback = false' <<<"$PUBLIC_ROUTE"
grep -q 'providerId = "icp-llm"' <<<"$CANDIDATE_ROUTE"
grep -q 'explicitOperatorAction = true' <<<"$CANDIDATE_ROUTE"
grep -q 'promotionRequired = true' <<<"$CANDIDATE_ROUTE"
grep -q 'providerId = "none"' <<<"$NATIVE_ROUTE"
grep -q 'invocationPermitted = false' <<<"$NATIVE_ROUTE"
[[ "$BEFORE_SUMMARIES" == "$AFTER_SUMMARIES" ]]
[[ "$BEFORE_FEEDBACK" == "$AFTER_FEEDBACK" ]]
~~~

The route-preview results describe policy only. They must not produce a model response, alter stored data, or change the public Aion answer route.

Also confirm the existing native continuity API is unaffected. With an authenticated identity, `previewMyContinuity` must remain read-only. In a signed-out private browser session, it must still return `unauthenticated` for a valid query.

## Regression Checklist

Verify the following without deleting existing continuity:

- In `aion.html`, existing authenticated continuity remains visible and usable.
- The continuity indicator still reflects its state.
- The delete-memory confirmation flow is present; use only a disposable identity if a destructive deletion test is needed.
- Admin feedback and provider-evaluation tools still load.
- A normal public Aion conversation still receives its OpenAI-backed response.

## Archive And Tag

After all checks pass, capture the deployed baseline and record this milestone:

~~~bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \
  deployed/teves_consulting_backend.did \
  deployed/teves_consulting_backend.most

git commit -m "Record native provider route preview deployment"
git push

git tag -a phase7-native-provider-route-preview -m "Native Aion provider route preview"
git push origin phase7-native-provider-route-preview
~~~

Keep the rollback snapshot until post-upgrade checks and baseline capture are complete.

## Rollback

If the backend becomes unavailable or continuity behavior regresses, restore the recorded snapshot:

~~~bash
icp canister stop teves_consulting_backend -e ic
icp canister snapshot restore teves_consulting_backend "$SNAPSHOT_ID" -e ic
icp canister start teves_consulting_backend -e ic
icp canister status teves_consulting_backend -e ic
~~~
