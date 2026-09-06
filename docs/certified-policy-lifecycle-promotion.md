# Certified Policy Lifecycle Promotion

This runbook promotes the internal certified-policy lifecycle for Aion's fixed public provider-policy snapshot.

The backend sets its 32-byte certified-data value from the private canonical policy snapshot during actor initialization. Actor initialization runs on install and upgrade, so the same digest is re-established after an upgrade.

This is preparation for a later certificate-backed policy query. It does not yet expose a certificate or a certified-policy API.

## Scope

This promotion changes only internal backend certified data.

It does not:

- change the public Candid interface;
- add a public certificate query;
- change public Aion answer routing;
- invoke OpenAI, an ICP LLM canister, or any other provider;
- add HTTPS outcalls;
- accept, read, write, or expose continuity memory;
- change feedback, relationship, or memory behavior;
- enable automatic provider fallback or switching.

## Promotion Success Criteria

All of the following must be true before this promotion is considered complete:

- Existing public functionality remains available.
- Existing memories and feedback remain readable.
- Existing delete-memory functionality remains available.
- Existing authenticated continuity remains intact.
- Existing clients remain Candid-compatible.
- `previewMyContinuity` remains caller-scoped and read-only.
- `previewAionProviderRoute` reports the same fixed three-route policy.
- The certified-policy lifecycle completes on local install and upgrade without changing stored feedback.
- No provider call, HTTPS outcall, memory write, or feedback write occurs as part of the lifecycle.
- The continuity indicator, Admin tools, and public Aion conversation remain usable.

## Pre-Promotion Gate

Run the review from a clean, pushed worktree:

~~~bash
./scripts/review-certified-policy-lifecycle-promotion.sh
~~~

Do not continue unless it reports success. The review proves that the candidate preserves the public Candid interface, passes the full native test suite, and that mainnet remains on the committed provider-route-preview baseline.

Run the local lifecycle smoke test before promoting. It starts an isolated local network, installs and upgrades the backend, and confirms feedback is unchanged across the lifecycle:

~~~bash
bash scripts/smoke-certified-policy-lifecycle-local.sh
~~~

After it passes, clean up the local network:

~~~bash
icp canister stop teves_consulting_backend -e local
icp canister delete teves_consulting_backend -e local
icp network stop
rm -f .icp/data/mappings/local.ids.json
~~~

## Controlled Upgrade

Use the controller identity. Create a fresh rollback snapshot before upgrading:

~~~bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"
icp canister start teves_consulting_backend -e ic
icp deploy teves_consulting_backend -e ic --mode upgrade
~~~

Do not pass `--yes`; retain the ICP CLI compatibility confirmation.

## Post-Upgrade Checks

Confirm the backend is running and that its public interface remains unchanged:

~~~bash
icp canister status teves_consulting_backend -e ic
./scripts/preflight-motoko-backend-upgrade.sh
~~~

With the controller identity, confirm the lifecycle did not change stored data or either existing native read-only API:

~~~bash
BEFORE_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
BEFORE_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

CONTINUITY="$(icp canister call teves_consulting_backend previewMyContinuity '("How should the Motoko backend deploy?")' -e ic --query)"
PUBLIC_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {publicAnswer})' -e ic --query)"
CANDIDATE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {adminCandidateEvaluation})' -e ic --query)"
NATIVE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {nativeContinuityPreview})' -e ic --query)"

AFTER_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
AFTER_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

printf '%s\n%s\n%s\n%s\n' "$CONTINUITY" "$PUBLIC_ROUTE" "$CANDIDATE_ROUTE" "$NATIVE_ROUTE"
grep -q 'queryIntent' <<<"$CONTINUITY"
grep -q 'providerId = "openai"' <<<"$PUBLIC_ROUTE"
grep -q 'automaticFallback = false' <<<"$PUBLIC_ROUTE"
grep -q 'providerId = "icp-llm"' <<<"$CANDIDATE_ROUTE"
grep -q 'explicitOperatorAction = true' <<<"$CANDIDATE_ROUTE"
grep -q 'providerId = "none"' <<<"$NATIVE_ROUTE"
grep -q 'invocationPermitted = false' <<<"$NATIVE_ROUTE"
[[ "$BEFORE_SUMMARIES" == "$AFTER_SUMMARIES" ]]
[[ "$BEFORE_FEEDBACK" == "$AFTER_FEEDBACK" ]]
~~~

The lifecycle intentionally has no public certificate method yet. The successful local install-and-upgrade smoke test establishes that the private digest-setting path executes without trapping or altering stable state. Certificate exposure and external verification remain a later, separately reviewed phase.

Also confirm the existing native continuity API rejects an anonymous caller with `unauthenticated`, then verify the normal site behavior:

- In `aion.html`, authenticated continuity remains visible and usable.
- The continuity indicator still reflects its state.
- The delete-memory confirmation flow is present; use only a disposable identity for any destructive test.
- Admin feedback and provider-evaluation tools still load.
- A normal public Aion conversation still receives its OpenAI-backed response.

## Archive And Tag

After all checks pass, capture the deployed baseline and record the milestone:

~~~bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \
  deployed/teves_consulting_backend.did \
  deployed/teves_consulting_backend.most

git commit -m "Record certified policy lifecycle deployment"
git push

git tag -a phase7-certified-policy-lifecycle -m "Certified Aion policy lifecycle"
git push origin phase7-certified-policy-lifecycle
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
