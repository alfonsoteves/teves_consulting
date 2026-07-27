# Operator Role Control Note

Phase 9.7 adds local workflow controls to `operator.html`.

The public frontend exposes only protected Render bridge status and local browser UI state. It does not expose Teves backend internals, private tests, provider credentials, private continuity, implementation evidence, or operator scripts.

The controls are intentionally bounded:

- inspect;
- select role view;
- accept for local workflow;
- reject;
- request revision;
- return to role;
- restore safe default.

Accepting a role output in this surface does not write canonical continuity, authorize implementation, change provider routing, or change public behavior.
