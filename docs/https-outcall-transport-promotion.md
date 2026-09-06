# HTTPS Outcall Transport Promotion

This runbook promotes the Phase 7.78 non-replicated HTTPS transport proof.
It establishes a narrowly bounded, operator-only outbound transport capability.
It does not add a reasoning-provider integration.

## Scope

`probeHttpsOutcallTransport()` is an operator-only backend update method. Its
request is completely fixed in private Motoko policy:

- URL: `https://www.tevesconsulting.com/`
- method: `GET`
- execution: non-replicated (`is_replicated = false`)
- headers: none
- request body: none
- response limit: 32,768 bytes
- attached-cycle ceiling: 20,000,000,000 cycles

The method returns only a transport receipt: fixed URL, HTTP status, response
byte count, and non-replicated status. It does not return or store the external
response body.

## Boundaries

This promotion does not add OpenAI, ICP LLM, provider credentials, prompts,
user identity, continuity memory, relationship data, provider routing, memory
writes, automatic fallback, or a public-answer route change.

It proves outbound transport capability only. A provider adapter remains a
separate, explicitly reviewed Phase 7.79 concern.

The transport request is non-replicated. Its external observation must not be
used to mutate continuity, memory, policy, or any other persistent state.

## Promotion Success Criteria

- Existing public Aion conversation remains on the approved OpenAI path.
- Existing caller-owned memory and continuity behavior remain unchanged.
- Existing feedback submission remains available.
- Existing clients remain Candid-compatible.
- The candidate adds only `probeHttpsOutcallTransport`.
- The candidate request remains fixed, header-free, body-free, GET-only, and
  non-replicated.
- Only the allowlisted Internet Identity operator can invoke the probe.
- The observed receipt contains no external response body.
- No provider call, memory write, or automatic fallback occurs.

## Pre-Promotion Review

From a clean, pushed worktree, run:

```bash
./scripts/review-https-outcall-transport-promotion.sh
```

This review builds and tests the candidate, proves that its Candid contract is
one additive method, checks the fixed request policy in source, and confirms
the live backend is still on the committed baseline. It creates no outbound
request.

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
It must not be able to invoke the transport probe:

```bash
if icp canister call teves_consulting_backend probeHttpsOutcallTransport '()' -e ic; then
  printf 'Unexpected controller access to HTTPS transport probe.\n' >&2
  exit 1
fi
```

From the authenticated, allowlisted Admin page, run the separate operator
transport diagnostic once. Confirm that it shows only the fixed URL, HTTP
status, response-byte count, and `isReplicated: false`.

Then confirm the signed-in feedback dashboard, public Aion conversation,
caller-owned memories, and native continuity preview still work. The probe is
not a provider call and does not alter any of them.

## Record The Deployment

```bash
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend

git add deployed/teves_consulting_backend.baseline.json \\
  deployed/teves_consulting_backend.did \\
  deployed/teves_consulting_backend.most
git commit -m "Record HTTPS outcall transport deployment"
git push

./scripts/preflight-motoko-backend-upgrade.sh
git status --short
```

After the post-upgrade checks pass, tag the recorded deployment before moving
to the provider-adapter work.
