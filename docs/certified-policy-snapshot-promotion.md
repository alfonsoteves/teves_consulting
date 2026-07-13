# Certified Policy Snapshot Promotion

This runbook promotes Aion's public, read-only certified-policy snapshot query:

`getCertifiedAionProviderPolicy()`

The query returns one fixed, public policy snapshot, its SHA-256 digest, and the ICP data certificate available during the query. It is an evidence surface for a later external verifier, not a provider-routing authority.

## Scope

The promotion adds one backward-compatible anonymous Candid query to `teves_consulting_backend`.

The response contains:

- `policyVersion`, the reviewed policy release marker;
- `canonicalSnapshot`, the exact three-route public policy serialization;
- `snapshotHash`, the SHA-256 digest of that serialization;
- `certificate`, the optional ICP data certificate returned during the query.

It does not:

- change public Aion answer routing;
- invoke OpenAI, an ICP LLM canister, or any other provider;
- add HTTPS outcalls;
- send prompts, continuity, identity, credentials, or provider payloads to the policy query;
- write memory, relationships, feedback, or provider policy;
- verify a certificate in Render or authorize an adapter handoff;
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
- `getCertifiedAionProviderPolicy` returns the exact reviewed policy version, all three canonical routes, a 32-byte snapshot hash, and a non-empty mainnet certificate.
- The snapshot query makes no memory writes, feedback writes, provider calls, or HTTPS outcalls.
- The continuity indicator, Admin tools, and public Aion conversation remain usable.

## Pre-Promotion Gate

Run the dedicated review from a clean, pushed worktree:

~~~bash
./scripts/review-certified-policy-snapshot-promotion.sh
~~~

Do not continue unless it reports success. The review proves that the candidate adds only `getCertifiedAionProviderPolicy` and that mainnet is still on the prior provider-route-preview baseline.

The local lifecycle-and-snapshot smoke test must already have passed:

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

Confirm the backend is running:

~~~bash
icp canister status teves_consulting_backend -e ic
~~~

With the controller identity, confirm the snapshot query returns only the fixed public policy and that existing native read-only APIs remain unchanged:

~~~bash
BEFORE_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
BEFORE_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

POLICY="$(icp canister call teves_consulting_backend getCertifiedAionProviderPolicy '()' -e ic --query)"
CONTINUITY="$(icp canister call teves_consulting_backend previewMyContinuity '("How should the Motoko backend deploy?")' -e ic --query)"
PUBLIC_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {publicAnswer})' -e ic --query)"
CANDIDATE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {adminCandidateEvaluation})' -e ic --query)"
NATIVE_ROUTE="$(icp canister call teves_consulting_backend previewAionProviderRoute '(variant {nativeContinuityPreview})' -e ic --query)"

AFTER_SUMMARIES="$(icp canister call teves_consulting_backend getMyAllSummaries '()' -e ic --query)"
AFTER_FEEDBACK="$(icp canister call teves_consulting_backend getFeedbackCount '()' -e ic --query)"

printf '%s\n%s\n%s\n%s\n%s\n' "$POLICY" "$CONTINUITY" "$PUBLIC_ROUTE" "$CANDIDATE_ROUTE" "$NATIVE_ROUTE"
grep -q 'policyVersion = "aion-provider-policy-v1"' <<<"$POLICY"
grep -q 'publicAnswer|openai|openai-production-baseline|1|0|0|0' <<<"$POLICY"
grep -q 'adminCandidateEvaluation|icp-llm|icp-admin-candidate|1|1|1|0' <<<"$POLICY"
grep -q 'nativeContinuityPreview|none|native-continuity-preview|0|0|0|0' <<<"$POLICY"
grep -q 'snapshotHash = blob' <<<"$POLICY"
grep -q 'certificate = opt blob' <<<"$POLICY"
grep -q 'queryIntent' <<<"$CONTINUITY"
grep -q 'providerId = "openai"' <<<"$PUBLIC_ROUTE"
grep -q 'providerId = "icp-llm"' <<<"$CANDIDATE_ROUTE"
grep -q 'providerId = "none"' <<<"$NATIVE_ROUTE"
[[ "$BEFORE_SUMMARIES" == "$AFTER_SUMMARIES" ]]
[[ "$BEFORE_FEEDBACK" == "$AFTER_FEEDBACK" ]]
~~~

The non-empty certificate proves only that the query returned certificate material. It is not authorization by itself. Do not connect this output to a provider adapter until a separate verifier checks the certificate signature, canister scope, freshness, and snapshot hash against the certified data.

In a signed-out private browser session, `previewMyContinuity` must still return `unauthenticated` for a valid query. Then verify normal site behavior:

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

git commit -m "Record certified policy snapshot deployment"
git push

git tag -a phase7-certified-policy-snapshot -m "Certified Aion provider policy snapshot"
git push origin phase7-certified-policy-snapshot
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
