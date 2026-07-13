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

## Current Evidence

The first fixed observation set produced two full-coverage observations and one 50-percent-coverage semantic-review observation. It is useful diagnostic evidence only; it does not satisfy this window.

## Promotion Decision

Native continuity is eligible for the Phase 7.82 cutover review only when:

- the complete shadow window passes the structural and selection gates;
- all semantic substitutions have explicit accepted records;
- any relevance concern has a documented resolution or a deliberate native ranking adjustment with its own tests and shadow evidence;
- existing public Aion, memory, feedback, and operator security regression checks remain green;
- an explicit operator approval is recorded.

Until then, Render remains the public continuity selection path and the native result remains shadow evidence only.
