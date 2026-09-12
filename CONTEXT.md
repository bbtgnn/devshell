# Devshell

Desktop orchestrator that syncs a GitHub-backed project, runs its install/dev toolchain via a Bun sidecar, and opens native preview windows.

## Language

**Devshell**:
The desktop product that owns control UI, git sync, Bun install/run, and preview windows for a Project.
_Avoid_: CMS shell, authoring shell, Electrobun app

**Project**:
A GitHub repository (optional subdirectory) or local path that Devshell opens, syncs, and runs.
_Avoid_: Site, site files, workspace (unless meaning the Deno monorepo itself)

**Work root**:
The directory where install and `dev` run — the clone root, or a materialized copy of a monorepo subdirectory.
_Avoid_: WIP, clone dir (those are different)

**Data root**:
Durable on-disk home for clone cache, registry, and materialized work dirs (OS application support / XDG).
_Avoid_: WIP-PROTOTYPE, repo-local cache

**Bun engine**:
The resolved Bun CLI executable used for install and run (`embedded` or `path-which`).
_Avoid_: package manager (lockfile PM is informational only)

**Preview window**:
An OS-owned Devshell window navigated to a Project local URL (and path).
_Avoid_: embedded browser chrome, system browser tab (unless deliberately opened)

**Control window**:
The Devshell window for open/sync/run/stop, status, and logs.

**Guest app**:
The Project's running `dev` process (e.g. Astro), which may call Devshell over a loopback API later.
_Avoid_: CMS package, `@cms/*`

**Client package**:
Optional `@devshell/client` — types and thin fetch helpers for the Guest app; no git or window logic.
_Avoid_: isomorphic-git wrapper, Deno Desktop bindings

**Flavor**:
Build-time branding and defaults (app name, icon, locked Project URL). Paused for now.
_Avoid_: fork of the runner
