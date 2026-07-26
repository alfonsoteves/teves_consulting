# Aion PWA Foundation

## Scope

This first PWA release makes the existing public Aion web client installable while preserving the existing ICP identity, continuity, memory, provider, and deployment architecture.

Admin remains browser-oriented. The service worker does not register from `admin.html` and bypasses `/admin.html` and `/admin/` requests.

## Cache Policy

| Content | Strategy | Notes |
| --- | --- | --- |
| Aion shell pages | Network first, cached fallback | `/aion.html` and `/es/aion.html` can load when the network is unavailable. |
| Offline page | Precached | Used only as a fallback when the shell is unavailable. |
| Manifest and icons | Precached, refreshed in background | Supports installability. |
| Public static images and JavaScript | Cache first, refreshed in background | Limited to same-origin static assets. |
| Authenticated API calls | No service-worker caching | Cross-origin calls and non-GET requests are passed through. |
| Conversations, continuity, memory, provider responses, admin data | No service-worker caching | Browser storage and the service worker are caches only, never canonical state. |

## Offline Behavior

When offline, Aion may show the static shell. It must not imply that answers, sign-in, continuity loading, memory writes, feedback, or authenticated operations succeeded. The composer remains visible, but message submission is blocked with an explicit offline notice before the user message is added to the conversation.

If the cached shell loads but the main Aion module cannot finish loading, the PWA helper installs fallback actions for sign-in, message submission, and feedback so controls show a clear offline or loading-incomplete notice instead of failing silently.

If connectivity drops during an answer request, Aion shows a failure message and does not queue the request silently.

## Update Behavior

Static assets are versioned through the service-worker cache name. When a new worker is installed while an existing worker controls the page, Aion shows an update notice with a manual refresh action. The app reloads only after that action activates the waiting worker.

Browsers that support `beforeinstallprompt` may show a small install action when Aion is installable. Unsupported browsers, including iOS Safari, continue using their normal manual add-to-home-screen behavior.

## Rollback

To disable the PWA layer without changing backend behavior:

1. Remove the service-worker registration script from `aion.html` and `es/aion.html`.
2. Keep or remove `manifest.webmanifest`, icons, `offline.html`, `assets/js/aion-pwa.js`, and `aion-service-worker.js`.
3. Deploy the frontend.
4. Existing browsers may keep the old worker until they revisit the site. The current helper supports an emergency local reset URL: `/aion.html?aion-pwa-reset=1`. This unregisters the root service worker and clears `aion-pwa-static-*` caches for that browser.
5. If immediate deactivation is required for all clients, deploy a minimal `aion-service-worker.js` that deletes `aion-pwa-static-*` caches and calls `registration.unregister()` from controlled clients.

## Validation Checklist

- Manifest parses as valid JSON.
- `aion-service-worker.js` parses as valid JavaScript.
- `assets/js/aion-pwa.js` parses as valid JavaScript.
- `scripts/check-pwa-foundation.sh` passes.
- Aion pages include manifest metadata and service-worker registration.
- Admin does not include the PWA registration script.
- Static asset preparation mirrors PWA files into `site_dist`.
- Existing Motoko tests still pass.

## Known Limitations

- Internet Identity and Aion answers require network access.
- No offline AI inference.
- No offline continuity writes.
- No background sync.
- No push notifications.
- iOS installation behavior must be manually verified on device after deployment.
