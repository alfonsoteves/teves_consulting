# Native Continuity Shadow Window

This runbook defines the evidence required before native Motoko continuity can replace the current Render continuity selection in a public Aion answer request.

It applies only to Phase 7.80 shadow observation. It does not authorize a cutover, provider call, memory write, or public answer-path change.

## Boundary

Each observation must remain operator initiated in Admin and caller scoped:

- The browser calls `previewMyContinuity` using the signed-in Internet Identity.
- The browser sends the current caller's temporary memory snapshot and safe native preview IDs to the operator-protected Render comparison endpoint.
- Render compares its current selection only. It does not call a provider, store the observation, alter `/ask`, or write continuity state.
- The operator reviews the result. The browser-facing diagnostic exists to explain a mismatch; it is not a routing decision.

## Observation Window

Complete four runs of the fixed Admin observation set across at least 24 hours. This produces twelve observations:

- `What phase are we in?`
- `How should the Motoko backend deploy?`
- `What is the next action for Aion?`

A different caller or a substantial memory change starts a separate observation window. Do not combine evidence from different caller-owned memory sets.

## Structural Gate

Every observation must pass all of the following:

- query match;
- intent match;
- native IDs known to the caller;
- no blocked observation;
- no provider call;
- no memory write;
- no public answer-path change.

Any structural failure blocks cutover until it is diagnosed, fixed, and the full window is restarted.

## Selection Gate

Across the twelve-observation window:

- legacy-selection coverage must be at least 90 percent when calculated over all legacy-selected IDs;
- every observation below 100 percent coverage requires an operator review record;
- no active milestone or decision omitted by Motoko may remain unreviewed;
- an exact list match is welcome but not required when Motoko contains the complete legacy selection plus bounded, relevant context;
- identity memories that outrank project or decision memories for a project-status query require an explicit relevance review before cutover.

The threshold is evidence for a native-continuity promotion decision, not permission to change provider routing or enable automatic fallback.

## Semantic Substitution Record

Use this record for every non-exact observation. Keep the completed record in operator-controlled notes; do not add caller memory content to the public repository.

~~~text
Observation date and time:
Caller scope:
Query:
Render-selected IDs:
Native-ranked IDs:
Legacy coverage percentage:
Missing legacy IDs:
Native substitute IDs:
Operator judgment: accepted substitution | ranking issue | insufficient evidence
Reason:
Follow-up required:
~~~

An accepted substitution must identify why the native result is at least as useful for the query. A ranking issue or insufficient evidence blocks cutover until resolved and observed again.

## Completed Evidence

The completed browser-local, caller-scoped evidence window recorded four fixed
observation-set runs over more than 24 hours. It produced twelve observations,
twelve safety passes, 100-percent aggregate legacy-ID coverage, zero pending
acknowledgements, and zero unresolved semantic reviews.

The planning-intent refinement for the next-action query was explicitly
acknowledged: Motoko correctly classifies this question as `planning` while
the legacy selector classified it as `general`. This refinement did not omit
the legacy selection and remains documented evidence rather than a failure.

## Cutover Record

The Phase 7.82 operator cutover review confirmed that:

- the completed window satisfied the structural and selection gates;
- the planning refinement had an explicit operator acknowledgement;
- public Aion, memory, feedback, operator security, and the continuity
  indicator remained healthy;
- signed-in public Aion now uses the native Motoko continuity path;
- anonymous public Aion continues without caller continuity; and
- the approved public OpenAI answer route and no-fallback policy remain
  unchanged.

The browser-local evidence remains preserved as a completed Phase 7 artifact.
It is not a permanent operational data store or a reason to keep the shadow
controls active after cutover.
