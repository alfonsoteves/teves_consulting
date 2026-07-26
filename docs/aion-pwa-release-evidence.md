# Aion PWA Release Evidence

## Summary

The first Aion PWA release is an experience-layer enhancement for the existing public Aion client. It makes Aion installable where supported, adds a safe static application shell, provides explicit offline and degraded-connectivity messaging, and preserves the existing ICP identity, continuity, memory, provider, and deployment architecture.

Admin remains browser-oriented and outside the first PWA release.

## File Inventory

| File | Purpose |
| --- | --- |
| `src/teves_consulting_frontend/manifest.webmanifest` | Installable app metadata, icons, start URL, scope, display mode, and colors. |
| `src/teves_consulting_frontend/aion-service-worker.js` | Static-shell service worker with conservative same-origin caching and admin bypass. |
| `src/teves_consulting_frontend/assets/js/aion-pwa.js` | Registration, update prompt, offline notices, install-readiness prompt, and emergency reset behavior. |
| `src/teves_consulting_frontend/offline.html` | Honest offline fallback page. |
| `src/teves_consulting_frontend/android-chrome-512x512.png` | 512px app icon for installability. |
| `src/teves_consulting_frontend/aion.html` | English public Aion client wiring for manifest, service worker helper, offline status, and offline submit blocking. |
| `src/teves_consulting_frontend/es/aion.html` | Spanish public Aion client wiring for manifest, service worker helper, offline status, and offline submit blocking. |
| `scripts/check-pwa-foundation.sh` | Repeatable PWA-specific validation. |
| `docs/aion-pwa-foundation.md` | Foundation architecture, cache policy, offline behavior, update behavior, limitations, and rollback notes. |

## Cache Policy

| Surface | Service-worker behavior | Rationale |
| --- | --- | --- |
| Aion shell pages | Network first with cached fallback for `/aion.html` and `/es/aion.html`. | Keeps the shell fresh while allowing offline launch. |
| Offline fallback | Precached. | Provides an honest fallback if the shell is unavailable. |
| Manifest and icons | Precached and refreshed through the versioned static cache. | Required for installability and launch quality. |
| Same-origin static images and JavaScript | Cache first with background refresh. | Safe public assets only. |
| Cross-origin API calls | Bypassed. | Prevents accidental caching of provider, auth, or Render responses. |
| Non-GET requests | Bypassed. | Prevents message submissions, feedback, auth, and writes from being cached or replayed. |
| Admin pages and admin paths | Bypassed. | Keeps operator tooling browser-oriented and outside the PWA scope. |
| Conversations, continuity, memory, provider responses, inference results | Not cached. | Browser storage and the service worker are caches only, never canonical state. |

## Authentication Test Plan

| Scenario | Expected result | Status |
| --- | --- | --- |
| First-time login from browser tab | Internet Identity opens normally and Aion creates an authenticated actor after success. | Pending manual production/device verification. |
| First-time login from installed PWA | Internet Identity handoff opens normally; returning to Aion restores authenticated state if the browser permits it. | Pending manual production/device verification. |
| Returning login/session restoration | Existing Internet Identity session is reused by the current AuthClient flow. | Pending manual production/device verification. |
| Logout | Aion logs out, clears in-memory identity state, and resets the actor to anonymous. | Pending manual production/device verification. |
| Cancelled login | User remains unauthenticated; no memory or continuity writes occur. | Pending manual production/device verification. |
| Expired delegation | Existing AuthClient behavior handles reauthentication; no PWA-specific identity layer is introduced. | Pending manual production/device verification. |
| Offline login attempt | User sees an offline/loading notice; no login success is implied. | Covered by static check and pending manual verification. |

## Device And Browser Matrix

| Environment | Required check | Expected result | Status |
| --- | --- | --- | --- |
| Desktop browser | Open `/aion.html`, inspect manifest registration, and verify normal sign-in/ask flow. | Works as regular website plus PWA metadata. | Pending manual production verification. |
| Desktop installed mode where supported | Install prompt appears when browser exposes `beforeinstallprompt`; installed window starts at `/aion.html?source=pwa`. | Installed app launches the public Aion client. | Pending manual production verification. |
| iPhone Safari | Add to Home Screen manually. | App launches full-screen/standalone style where iOS supports it; Internet Identity handoff requires manual verification. | Pending manual production verification. |
| iPhone installed PWA | Launch, sign in, ask, logout, suspend, relaunch. | Same Aion identity and continuity flow; no separate auth path. | Pending manual production verification. |
| Android Chrome | Browser install prompt or menu install. | Installable app metadata and icons appear; launch starts public Aion. | Pending manual production verification. |
| Offline launch | Open installed app or browser route after static shell is cached and network is unavailable. | Shell or offline page loads; answers, sign-in, memory, and continuity are clearly unavailable. | Pending manual production verification. |
| Slow/intermittent network | Submit an answer during degraded connectivity. | Request either succeeds normally or fails with explicit retry message; no silent queue. | Pending manual production verification. |
| Dark mode | Toggle Aion dark mode with offline/update notices. | Notices remain readable and do not occlude core controls. | Pending manual production verification. |
| Narrow/mobile viewport | Review header, composer, notices, keyboard, and scrolling. | No overlap with safe-area insets; tap targets remain usable. | Pending manual production verification. |

## Automated Evidence

The local validation command set for this milestone is:

```bash
scripts/check-pwa-foundation.sh
git diff --check
scripts/prepare-frontend-assets.sh
mops test
icp build teves_consulting_frontend
```

Most recent known result after the install-readiness batch:

- PWA foundation checks passed.
- Frontend assets prepared.
- Motoko tests passed: 32 files.
- Frontend canister build passed.

## Security Considerations

- The service worker does not cache cross-origin requests.
- The service worker does not cache non-GET requests.
- Authenticated API responses, conversations, memory data, continuity data, provider responses, inference results, and admin data are not cached.
- Admin is explicitly bypassed by the service worker and does not register the PWA helper.
- Offline messaging is explicit and does not imply that any authenticated action succeeded.
- No push notifications, background sync, background execution, local canonical memory, or offline writes are included.
- The emergency reset URL `/aion.html?aion-pwa-reset=1` unregisters the root service worker and clears `aion-pwa-static-*` caches in the current browser.

## Accessibility Findings

- Offline and update notices use `role="status"` and `aria-live="polite"`.
- Notices are keyboard accessible through ordinary buttons.
- Notices stack vertically on small screens.
- Reduced-motion preferences are already respected for the existing continuity animation.
- Manual mobile testing is still required for keyboard overlap, safe-area insets, scrolling during responses, and installed-mode browser chrome differences.

## Rollback Procedure

Use the documented rollback in `docs/aion-pwa-foundation.md`.

Short rollback path:

1. Remove the PWA helper script from `aion.html` and `es/aion.html`.
2. Deploy the frontend.
3. Ask affected users to visit `/aion.html?aion-pwa-reset=1` if a stale local cache needs to be cleared immediately.
4. If a global emergency reset is required, deploy a temporary service worker that deletes `aion-pwa-static-*` caches and unregisters itself.

## Production Deployment Checklist

Before production deployment:

- Confirm repo is clean except intended PWA files.
- Run `scripts/check-pwa-foundation.sh`.
- Run `git diff --check`.
- Run `scripts/prepare-frontend-assets.sh`.
- Run `mops test`.
- Run `icp build teves_consulting_frontend`.
- Confirm frontend canister has enough cycles.

Production deployment remains human-approved:

```bash
icp canister start teves_consulting_frontend -e ic
icp deploy teves_consulting_frontend -e ic --mode upgrade
```

After production deployment:

- Open `/aion.html` in a normal browser tab.
- Confirm manifest and service worker registration in browser dev tools.
- Confirm install prompt behavior where supported.
- Confirm `/aion.html?aion-pwa-reset=1` clears local PWA caches.
- Confirm admin still opens without PWA registration.
- Complete iPhone and Android manual checks.

## Decisions Required

- Production deployment approval.
- Manual device coverage available for iPhone and Android.
- Whether Admin should remain excluded for the full first release. Current recommendation: yes.

## Recommended Future Enhancements

These are not part of the first PWA foundation:

- In-app iOS add-to-home-screen guidance.
- More formal visual QA screenshots across installed modes.
- A small diagnostics view for PWA state in Admin, if operator visibility becomes useful.
- Push notifications only after a separate privacy and product review.
- Background sync only after a separate security review; current recommendation is to avoid it for conversations and memory writes.
