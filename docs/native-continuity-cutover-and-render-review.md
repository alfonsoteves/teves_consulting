# Phase 7.82 Native Continuity Cutover And Render Review

## Decision

Signed-in public Aion requests now use caller-scoped native Motoko continuity
selection before invoking the existing OpenAI answer path. The browser calls
`previewMyContinuity` under the user's Internet Identity, then sends only the
bounded `contextPreview` to Render with `continuityMode: "native"`.

Render does not run the Python continuity selector for a native-mode request.
If a native preview is unavailable, the request continues without continuity;
it does not silently fall back to Python selection. Anonymous users continue
to receive the existing public Aion answer path without caller continuity.

This cutover changes continuity selection only. It does not change the
OpenAI model, public answer prompt, provider route, memory write path,
feedback, provider fallback policy, or candidate-provider boundary.

## Evidence

The Phase 7.80 browser-local, caller-scoped shadow window completed before
cutover with:

- four observation-set runs across more than 24 hours;
- twelve observations and twelve structural safety passes;
- 100 percent aggregate legacy-ID coverage;
- one documented planning-intent refinement;
- zero unresolved semantic reviews or pending operator acknowledgements;
- no provider calls, memory writes, or public answer-path changes during the
  observation window.

The fixed evidence queries were:

- `What phase are we in?`
- `How should the Motoko backend deploy?`
- `What is the next action for Aion?`

The post-cutover acceptance check confirmed that signed-in continuity,
anonymous public Aion, the continuity indicator, and ordinary response timing
remain healthy.

## Current Request Path

### Signed-in Aion

1. The browser calls `previewMyContinuity(query)` as the signed-in Internet
   Identity principal.
2. Motoko selects bounded ranked and relationship-expanded memories from that
   principal's continuity only and returns a provider-neutral context packet.
3. The browser sends the query and native context packet to Render with the
   explicit `native` continuity mode.
4. Render passes that context to the existing grounded OpenAI answer adapter.
5. The answer returns through the unchanged public Aion interface.

### Anonymous Aion

Anonymous users do not have caller-scoped memory. The browser sends the
existing public request in native mode with an empty continuity packet, and
Render produces the normal public OpenAI answer without continuity.

## Rollback

The rollback is frontend-only and does not require a Motoko data migration or
canister rollback. Reverting the public Aion asset release makes the browser
omit `continuityMode: "native"`; Render retains its backward-compatible legacy
continuity handling for that older request shape.

Before any rollback, preserve the observed issue, verify that it is a native
continuity issue rather than an OpenAI/provider issue, and record the reason.
The pre-cutover frontend commit is the operational rollback point.

## Render Retirement Review

### Moved To ICP

These responsibilities are now owned by ICP and native Motoko:

- Internet Identity caller scope and ownership;
- continuity memory storage and deletion;
- continuity selection, ranking, intent, relationship expansion, and context
  construction;
- read-only native continuity preview;
- provider route policy and certified public policy snapshot;
- operator allowlist, one-time operator grant issuance, and grant redemption;
- bounded non-replicated HTTPS transport capability.

The legacy Python continuity selector is no longer in the active path for the
updated public Aion pages. Keep its compatibility branch temporarily while the
previous frontend asset can still be cached or intentionally rolled back.

### Remains On Render Intentionally

Render remains a deliberately small external-provider and operations boundary:

- OpenAI credential custody and the approved public OpenAI adapter;
- grounded public-knowledge retrieval and answer assembly;
- session summarization through the existing external provider path;
- public API rate limits, normalized errors, health checks, deployment logs,
  and operational monitoring;
- protected Admin reports that inspect the external-provider boundary.

### Future Migration Candidates

These are not Phase 7 changes and require their own design, security, cost,
and regression work:

- public-knowledge corpus indexing and retrieval;
- provider-adapter hosting and credential architecture;
- rate-limit, abuse-protection, and edge delivery strategy;
- observability, alerting, and durable operational reporting;
- removal of the legacy Python continuity compatibility branch after a defined
  client-release observation period.

## Recommendation

Choose **Render reduced and retained intentionally**.

Phase 7 removes Render from ownership of Aion identity, continuity, selection,
context, policy, and governance. It does not yet provide a safer replacement
for external-provider credentials, public knowledge retrieval, rate limiting,
or operational monitoring. Retiring Render now would couple a successful
continuity cutover to unrelated provider and infrastructure work.

