# Motoko Backend Upgrade Runbook

This runbook promotes the Phase 7 Motoko build modernization only. It does not add Aion intelligence behavior, change provider routing, or alter the public Candid interface.

## Preconditions

- Run from the reviewed `phase7-motoko-modernization` branch after it is clean and pushed.
- Use the named ICP identity that controls `teves_consulting_backend`.
- Confirm that the local upgrade rehearsal and Mops stable-compatibility check have passed.
- Schedule a short maintenance window and keep the snapshot identifier available until post-upgrade checks pass.

## Read-Only Preflight

Run this first:

```bash
./scripts/preflight-motoko-backend-upgrade.sh
```

It checks formatting, Mops stable compatibility, the v5 ICP recipe build, the committed Candid baseline, and the live canister interface. It does not create a snapshot, write memory, or upgrade a canister.

Do not continue unless the preflight reports success.

## Go / No-Go

Proceed only when all of these are true:

- The working tree is clean and the reviewed branch is the source being deployed.
- The preflight passes without warnings that need investigation.
- The live backend is running and the operator identity is a controller.
- A rollback window is available.

Otherwise, stop. The existing backend remains the correct production state.

## Controlled Upgrade

Creating a snapshot requires a brief stop. Stop the backend, create the snapshot, record the returned identifier, then start the backend again before the upgrade:

```bash
icp canister stop teves_consulting_backend -e ic
SNAPSHOT_ID="$(icp canister snapshot create teves_consulting_backend -e ic -q)"
printf 'Rollback snapshot: %s\n' "$SNAPSHOT_ID"
icp canister start teves_consulting_backend -e ic
```

Upgrade only the backend. Do not pass `--yes`; retain the ICP CLI's compatibility confirmation:

```bash
icp deploy teves_consulting_backend -e ic --mode upgrade
```

## Post-Upgrade Checks

```bash
icp canister status teves_consulting_backend -e ic
./scripts/capture-backend-baseline.sh
mops deployed teves_consulting_backend
```

Then test the live site with an existing authenticated identity:

- Open `aion.html` and confirm the continuity indicator still reflects the existing state.
- Confirm Aion can use existing continuity without creating or deleting test memories.
- Confirm the Admin page still loads and its existing backend tools respond normally.

Commit the refreshed `deployed/` baseline only after these checks pass.

## Rollback

If the backend is unavailable or continuity behavior regresses, restore the recorded snapshot:

```bash
icp canister stop teves_consulting_backend -e ic
icp canister snapshot restore teves_consulting_backend "$SNAPSHOT_ID" -e ic
icp canister start teves_consulting_backend -e ic
icp canister status teves_consulting_backend -e ic
```

Do not remove the snapshot until the upgrade has been verified.
