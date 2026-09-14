# Devshell

Desktop orchestrator that syncs a GitHub-backed project, runs its install/dev toolchain via a Bun sidecar, and opens native preview windows.

## Scope

**In scope:** macOS, Windows, and Linux desktop.

**Out of scope:** iOS and Android (native mobile shells, on-device Bun sidecar, mobile companion apps). Deno Desktop does not ship mobile targets; Devshell does not wait on them or adopt another shell for phones. **System tray** is also out of scope — control and preview windows are the UX; do not add `Deno.Tray`.

**Engine install:** If no Bun is found, Devshell downloads a pinned Bun build into the Data root on first launch (rather than requiring Bun inside the shipped app bundle).

**Deferred product/distribution choices** (signing, auto-update, flavors, CEF, richer installers): see [docs/roadmap.md](docs/roadmap.md).

## Language

**Devshell**:
The desktop product (macOS / Windows / Linux) that owns control UI, git sync, Bun install/run, and preview windows for a Project.
_Avoid_: Electrobun app, mobile app, phone companion

**Project**:
A GitHub repository (optional subdirectory) or local path that Devshell opens, syncs, and runs.
_Avoid_: Site, site files, workspace (unless meaning this Deno workspace)

**Work root**:
The directory where install and `dev` run — the clone root, or a materialized copy of a monorepo subdirectory.
_Avoid_: treating the clone cache path as the run directory when a subdirectory was requested

**Data root**:
Durable on-disk home for clone cache, registry, materialized work dirs, and the pinned Bun engine cache (OS application support / XDG).
_Avoid_: repo-local clone caches

**Bun engine**:
The Bun CLI executable used for install and run (PATH / `DEVSHELL_BUN_PATH`, else a pinned download under the Data root).
_Avoid_: package manager; multiple “sources” as domain concepts

**Preview window**:
An OS-owned Devshell window navigated to a Project local URL (and path).
_Avoid_: embedded browser chrome, system browser tab (unless deliberately opened)

**Control window**:
The Devshell window for open/sync/run/stop, status, and logs.

**Project session**:
The module that opens a Project end-to-end: resolve Bun engine, sync into the Work root, install, run Guest `dev`, and emit preview URL, logs, terminal phases, and cancel. Control starts/stops/reads a snapshot; Preview window chrome stays outside.
Phases (Control `phase` string): `idle` → `resolving` (Bun engine) → `cloning` (sync) → `installing` → `starting` → `waiting_for_url` → `previewing`, or `failed` / `stopped`.
_Avoid_: treating Control bindings or `main` as the pipeline owner

**Guest app**:
The Project's running `dev` process, which may call Devshell over a loopback API later.

**Client package**:
Optional `@devshell/client` — types and thin fetch helpers for the Guest app; no git or window logic.
_Avoid_: isomorphic-git wrapper, Deno Desktop bindings

**Flavor**:
Build-time branding and defaults (app name, icon, locked Project URL). Not shipping yet.
_Avoid_: fork of the runner
