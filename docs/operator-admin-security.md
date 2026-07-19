# Operator Admin Security

Phase 7.77 makes Admin access a server-enforced operator capability.

## Boundary

The production Internet Identity allowlist remains in the backend canister.
The browser never supplies a principal for Render to trust.

After a signed-in allowlisted operator calls `issueOperatorSessionGrant`, the
backend stores only the SHA-256 digest of a 32-byte nonce for at most five
minutes. Render redeems that one-time nonce through
`redeemOperatorSessionGrant`, then returns a 30-minute in-memory bearer
session. Render stores only the session-token digest.

Every `/admin/*` endpoint except `POST /admin/operator-session` requires that
server-side session. The exchange endpoint still verifies the one-time native
grant; it is not a bypass.

The Admin page is a dark operator interface. It hides its content until both
the native allowlist and the Render session succeed. An unauthorised user sees
only this message:

`Access denied. This interface is restricted to the Teves Consulting operator.`

## Guardrails

- No arbitrary browser principal is accepted by Render.
- The raw native nonce is not persisted in the canister or Render session
  store.
- A nonce is single-use, short-lived, and digest-backed.
- A Render session is short-lived, digest-backed, and lost on service restart.
- Missing, expired, malformed, or replayed credentials fail closed.
- The session mechanism does not change public Aion answers, continuity,
  memory ownership, provider routing, or automatic fallback.
- The closed native LLM provider-boundary Admin controls keep live metadata,
  health, and status transport disabled for the current `w36hm...` path unless
  a future native decision explicitly reopens transport.

The deployed native LLM provider-boundary Admin closure is documented in:

- `docs/native-llm-provider-boundary-admin-closure.md`

## Release Checks

### Browser Checks

1. Sign in to `admin.html` with the configured production operator identity.
   Admin displays `Operator access verified` and aggregate feedback loads.
2. Sign out, then sign in using an ordinary Internet Identity. Only the access
   denied message is visible.
3. Repeat with any available local or recovery identity. It must also be
   denied unless it was explicitly added to the native allowlist.
4. Confirm `aion.html`, caller-owned memory controls, continuity, feedback
   submission, and public Aion conversation still behave normally.

### Direct Render Checks

Run these without a browser session. Both calls must be rejected with HTTP
401, proving a client-supplied header cannot stand in for an operator session:

```bash
API_BASE="https://aionic-agent-api.onrender.com"
BODY_FILE="${TMPDIR:-/tmp}/aion-admin-guard.json"

STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  "$API_BASE/admin/golden-tests/last")"
printf 'Anonymous Admin status: %s\n' "$STATUS"
cat "$BODY_FILE"
test "$STATUS" = "401"
grep -q 'operator_session_required' "$BODY_FILE"

STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H 'X-Internet-Identity-Principal: 7t3c5-b4wkk-4hpst-vos2y-dwyjj-jhmaj-5zhbx-7tjno-vegoy-sce44-kae' \
  "$API_BASE/admin/golden-tests/last")"
printf 'Claimed-principal Admin status: %s\n' "$STATUS"
cat "$BODY_FILE"
test "$STATUS" = "401"
grep -q 'operator_session_required' "$BODY_FILE"
```

The header value above is deliberately ignored. It demonstrates that Render
authorises only a redeemed native grant, not a claimed browser identity.

## Operational Notes

A Render restart invalidates its in-memory sessions. The operator can reload
Admin to mint and exchange a fresh native grant. This is deliberate: session
recovery requires the allowlisted Internet Identity again.

Future `operator.html` must use this same native-grant and Render-session
boundary; it must not introduce its own principal parameter or independent
authorization path.
