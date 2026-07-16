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

The current public site is static HTML. The previous React/Vite migration
material is excluded from `site_dist` and is not part of the live asset build.
It includes the frontend-local `src/`, `dist/`, `public/`, Vite configuration,
and associated workspace metadata, plus the older root React scaffold.

Those files may be removed after a focused cleanup verifies that:

1. the static staging command still produces the intended asset set;
2. the ICP frontend builds and deploys successfully;
3. Aion, Admin, and representative public pages load normally;
4. no active script, deployment workflow, or documentation requires Vite.

## Standard Frontend Deployment

```bash
rsync -av \
  --exclude dist \
  --exclude src \
  --exclude .DS_Store \
  src/teves_consulting_frontend/ \
  site_dist/

icp build teves_consulting_frontend
