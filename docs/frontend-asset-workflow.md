# Frontend Asset Workflow

## Source of Truth

The public Teves Consulting website is maintained as static assets in:

```text
src/teves_consulting_frontend/
```

This directory contains the English site, Spanish reference pages, Aion, Admin,
styles, images, icons, and the Internet Computer asset-domain declaration.

Edit website assets there. Do not edit `site_dist` directly.

## Deployment Staging

The ICP asset-canister recipe is configured to publish:

```text
site_dist/
```

`site_dist` is an ignored, generated staging directory. Before an asset build or
frontend deployment, it is refreshed from the source directory with these
exclusions:

- `dist/`;
- `src/`;
- `.DS_Store`.

That staging rule prevents development-only material from being uploaded to the
public asset canister.

```text
src/teves_consulting_frontend/  ->  site_dist/  ->  ICP asset canister
```

## Why `site_dist` Remains

`site_dist` is not a second website copy or a content-authoring location. It is
currently required because `icp.yaml` points the frontend asset-canister recipe
at that directory.

Removing it without replacing the staging rule would either break the frontend
deployment or make the mixed source directory eligible for publication. Retain
it until a separately reviewed asset-preparation workflow provides the same
allowlist behavior.

## Legacy React/Vite Material

The previous React/Vite migration scaffold and its Node workspace metadata were
retired after the static staging command, ICP frontend build, and live homepage,
Aion, and Admin checks all passed. The root TypeScript configuration is retired
with the same cleanup because it had no remaining consumer.

The current public site is static HTML and does not require a Node build step.

## Standard Frontend Deployment

```bash
rsync -av \
  --exclude dist \
  --exclude src \
  --exclude .DS_Store \
  src/teves_consulting_frontend/ \
  site_dist/

icp build teves_consulting_frontend
