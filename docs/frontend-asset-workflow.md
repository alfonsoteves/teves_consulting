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

`site_dist` is an ignored, generated staging directory. It provides a clean,
root-level publication boundary for the current ICP CLI asset synchronizer.

Run the preparation script before an asset build or frontend deployment:

```bash
scripts/prepare-frontend-assets.sh
```

It uses `rsync --delete --delete-excluded` to make `site_dist/` an exact copy
of the publishable source assets. It excludes:

- `dist/`, the retired local build output;
- `src/`, reserved for non-public development material;
- `.DS_Store`, macOS Finder metadata.

The source `.well-known/ic-domains` declaration remains included. Do not point
the current asset recipe at the nested source directory directly: the installed
asset synchronizer requires the root-level staging directory during sync.

```text
src/teves_consulting_frontend/  ->  site_dist/  ->  ICP asset canister
```

## Legacy React/Vite Material

The previous React/Vite migration scaffold and its Node workspace metadata were
retired after the static staging command, ICP frontend build, and live homepage,
Aion, and Admin checks all passed. The root TypeScript configuration is retired
with the same cleanup because it had no remaining consumer.

The current public site is static HTML and does not require a Node build step.

## Standard Frontend Deployment

```bash
scripts/prepare-frontend-assets.sh
icp build teves_consulting_frontend
icp deploy teves_consulting_frontend -e ic --mode upgrade
```
