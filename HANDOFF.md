# Devshell — handoff for new-repo initialization

**Audience:** Agent (or human) creating a **separate git repository** for Devshell and porting the spike + design into it.  
**Date:** 2026-09-12  
**Source monorepo:** `astro-dev-cms-gui` (this tree)  
**Working product name:** Devshell (placeholder — rename freely)

Do **not** treat this as part of the `@cms/*` authoring-shell package graph. Devshell is a **sibling product**: desktop orchestrator. CMS packages live in the Astro project Devshell opens, not inside Devshell.

---

## 1. One-liner

A desktop app that **syncs a GitHub repo**, **installs and runs `dev`** with an **embedded Bun** sidecar, and opens **native preview window(s)** on the detected local URL—optionally as a **branded single-repo build** (custom name/icon, locked git URL) so end clients never pick a repository.

Pitch metaphors (from prior art): **“LocalWP for a git-backed JS site”** + **“Gitpod preview semantics on the desktop.”**

---

## 2. What to copy first (canonical spike)

**Promote this directory as the code starting point:**

| Path (in source monorepo) | Role |
| --- | --- |
| [`.scratch/prototype-clone-run-deno-bun/`](../prototype-clone-run-deno-bun/) | **Chosen P3 spike** — Deno Desktop + Bun sidecar + isomorphic-git |
| `main.ts` | Control + preview `BrowserWindow`, pipeline, `Deno.serve`, bindings |
| `runner.ts` | bunEngine resolve, install/run spawn, URL scrape, clone/materialize |
| `machine.ts` | Phase state machine |
| `inspect-content-config.mjs` | Astro schema inspect via Bun (CMS-adjacent; **optional** for generic Devshell—trim or gate) |
| `smoke-resolve.ts` / `smoke-pipeline.ts` | Headless smokes |
| `scripts/vendor-bun.sh` | Vendor Bun binary for `embedded` |
| `deno.json` | Desktop config + `npm:isomorphic-git` imports |
| `README.md` | How to run the spike |

**Run (from source monorepo root):**

```bash
bun run prototype:clone-run-deno-bun
```

Or:

```bash
cd .scratch/prototype-clone-run-deno-bun
mise exec deno@2.9.6 -- deno desktop --hmr --backend webview -A --no-check \
  --config deno.json --include npm:isomorphic-git main.ts
```

**Default demo target:** `https://github.com/withastro/astro/tree/main/examples/blog`

**Do not promote as product shell:**

| Path | Status |
| --- | --- |
| `.scratch/prototype-clone-run/` | P1 — Deno alone; reference only |
| `.scratch/prototype-clone-run-electrobun/` | P2 — **rejected** (Electrobun) |

**WIP cache under spike** (`WIP-PROTOTYPE-wipe-me/`) is local scratch — **do not commit** into the new repo; recreate via `.gitignore`.

---

## 3. Locked technical decisions (ADR)

**Primary ADR (copy into new repo `docs/adr/`):**

- [`docs/adr/0001-deno-desktop-shell-bun-sidecar.md`](../../docs/adr/0001-deno-desktop-shell-bun-sidecar.md)

| Decision | Choice |
| --- | --- |
| Desktop shell | **Deno Desktop** (`BrowserWindow`), not Electrobun / Electron / CEF-as-product |
| Toolchain | **Bun sidecar** — `bunEngine.source`: `embedded` \| `path-which` |
| Git | **isomorphic-git** cache + registry; no system git required for sync |
| Preview | Second `BrowserWindow`; `navigate` / show / focus |
| Browser chrome | **Do not** rebuild URL bar / back-forward / `__dev` proxy (tried + reverted) |
| Split UI | Fake via `setSize` / `setPosition`; no native split pane required |
| Hard lesson | Never treat a **directory** named `bun` as the CLI executable |

**Still open (called out in spike README):** GitHub OAuth **device flow** (client_id only; token in keychain; `onAuth` for isomorphic-git). Packaging / notarization.

---

## 4. Product design (from design chats — 2026-09-12)

### 4.1 Core loop

1. Open project (git URL + optional subdirectory, or local path)  
2. Sync (clone/fetch; durable cache; materialize work dir for monorepo subdirs)  
3. Resolve Bun engine  
4. Install (manifest or defaults)  
5. Run `dev` (or named script)  
6. Detect base URL (stdout scrape + fallback)  
7. Open preview window(s)  
8. Watch git (dirty / ahead-behind); notify / reload / restart per config  

### 4.2 Window model

| Kind | Owner | Purpose |
| --- | --- | --- |
| Control / logs / status | **Devshell** | Open/sync/run/stop, engine, git badge, logs |
| Preview windows | **Project URLs** | `baseUrl + path` from manifest (e.g. `/`, `/_cms`) |

### 4.3 Repo-root config — `devshell.json` (proposed)

Lives in the **work root** of the cloned project (subdir root if monorepo slice). Draft shape from design chat:

```json
{
  "$schema": "https://example.com/devshell.schema.json",
  "name": "astro-blog",
  "engine": "bun",
  "install": ["bun", "install"],
  "scripts": {
    "dev": ["bun", "run", "dev"]
  },
  "url": {
    "from": "stdout",
    "pattern": "https?://(?:localhost|127\\.0\\.0\\.1):\\d+",
    "fallback": "http://localhost:4321"
  },
  "windows": [
    { "id": "site", "title": "Site", "path": "/" },
    { "id": "cms", "title": "Authoring", "path": "/_cms", "when": "dev" }
  ],
  "git": {
    "watch": true,
    "pollSeconds": 30,
    "onRemoteChange": "notify",
    "onPull": "reload"
  }
}
```

**Defaults if missing:** `bun install` + `bun run dev`, stdout URL detect, single window at `/`.

**Not in the manifest:** OAuth secrets, absolute machine paths, CMS package imports, full browser chrome.

Config cousins to study: `.launcher.yml`, `herd.yml`, Gitpod `ports.onOpen` / tasks — **not** full `devcontainer.json` as v1. See prior-art research §H.

### 4.4 Flavors (branded builds)

Same core; build-time **flavor** wraps it:

```json
{
  "appName": "Acme Authoring",
  "bundleId": "com.acme.authoring",
  "icon": "./assets/icon.icns",
  "project": {
    "url": "https://github.com/acme/site",
    "subdirectory": "",
    "branch": "main"
  },
  "ui": {
    "allowOpenOtherProjects": false,
    "autoStart": true,
    "windows": "from-manifest"
  }
}
```

- **Generic Devshell:** multi-repo picker, `allowOpenOtherProjects: true`  
- **Single-client CMS desktop:** locked `project`, custom name/icon, auto-start — client never selects a repo  

Branding = packaging + defaults, **not** a fork of the runner.

### 4.5 Guest-app bridge (cloned repo ↔ Devshell)

Devshell exposes a **loopback HTTP API** (extend existing `Deno.serve` in spike). Spawned `dev` process gets `DEVSHELL_API=http://127.0.0.1:<port>` (and/or `.devshell/runtime.json`, gitignored).

Proposed endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/git` | `{ branch, dirty, ahead, behind, head, remote }` |
| `POST /api/open-preview` | `{ path }` → `openPreview(new URL(path, previewBase))` |

Optional later: bind preview webview `bindings.*` when under Deno Desktop.

**Optional publishable package:** `@devshell/client` (name TBD) — **types + thin fetch helpers only**:

- Discover API base; `getGitStatus()`, `openPreview(path)`  
- Degrade to `null` / no-op when Devshell absent  
- **Zero** isomorphic-git / Deno / window logic  

Repos may raw-`fetch` the same endpoints without the package.

### 4.6 Deep interface to protect

Keep callers (UI, CLI, tests) behind something like:

```ts
openProject({ url | path, subdirectory? })
start() / stop()
getStatus() // phase, previewBaseUrl, git, engine
openWindow(id | path)
pull()
```

---

## 5. Hard boundaries vs CMS monorepo

| | **Devshell (new repo)** | **`@cms/*` (this monorepo)** |
| --- | --- | --- |
| Job | Clone / install / run / preview windows | Authoring shell at `/_cms` inside Astro |
| Imports | **Must not** depend on `@cms/*` | May optionally depend on `@devshell/client` |
| Runtime | Deno Desktop + Bun sidecar | Astro `dev` (Bun/Node) |
| Spec note | Authoring-shell [spec §1.3](../authoring-shell-spec/spec.md) lists Deno-desktop sync as out of **CMS** scope — correct; Devshell is separate |

If a project mounts `/_cms`, that is **just another preview `path`**. Form generation, Zod, write-back stay in the Astro app.

Related CMS-side notes (context only — **do not merge into Devshell core**):

- [`.scratch/authoring-shell-spec/research/17-form-pipeline-dev-route-preview.md`](../authoring-shell-spec/research/17-form-pipeline-dev-route-preview.md) — preview = site URL; harness open-window feasible  
- [`.scratch/authoring-shell-spec/research/16-schema-driven-crud-from-json-or-zod.md`](../authoring-shell-spec/research/16-schema-driven-crud-from-json-or-zod.md) — why CMS builds its own forms  
- Root [`CONTEXT.md`](../../CONTEXT.md) — domain language for authoring shell  

---

## 6. Research & design file index (copy or link)

### Must copy into new repo

| File | Why |
| --- | --- |
| [`.scratch/devshell/README.md`](README.md) | Product stub |
| [`.scratch/devshell/research/01-prior-art-local-repo-dev-orchestrators.md`](research/01-prior-art-local-repo-dev-orchestrators.md) | Prior art + white space |
| This file (`HANDOFF.md`) | Initialization brief |
| [`docs/adr/0001-deno-desktop-shell-bun-sidecar.md`](../../docs/adr/0001-deno-desktop-shell-bun-sidecar.md) | Accepted stack ADR |
| Entire [`.scratch/prototype-clone-run-deno-bun/`](../prototype-clone-run-deno-bun/) source (minus `WIP-PROTOTYPE-wipe-me/`) | Code baseline |

### Optional reference (leave in CMS monorepo or cite)

| File | Why |
| --- | --- |
| `.scratch/prototype-clone-run/README.md` + sources | P1 comparison |
| `.scratch/prototype-clone-run-electrobun/` | P2 rejected lessons (bun path = directory bug) |
| `.scratch/authoring-shell-spec/research/17-…` | Preview / `/_cms` bridge intent |
| `.scratch/authoring-shell-spec/map.md` | Points at Devshell folder |
| `package.json` scripts `prototype:clone-run*` | How spike was launched from monorepo |

---

## 7. New-repo layout (R0)

```
devshell/                          # git root
  README.md
  CONTEXT.md
  HANDOFF.md
  docs/adr/0001-deno-desktop-shell-bun-sidecar.md
  research/01-prior-art-local-repo-dev-orchestrators.md
  apps/desktop/                    # Deno Desktop app (promoted spike)
  packages/client/                 # @devshell/client stub
  .gitignore
```

**Paused:** `flavors/` (branded builds) — not in tree yet.  
**Data root:** OS app data (`~/Library/Application Support/Devshell/` on macOS), not repo-local WIP.

---

## 8. Phased build plan for the new agent

| Phase | Deliverable |
| --- | --- |
| **R0** | Init repo; copy ADR + research + spike; green `deno desktop` happy path on Astro blog |
| **R1** | Rename product; strip CMS-only `inspect-content-config` from default path (or behind flag) |
| **R2** | Implement `devshell.json` read + multi-window from `windows[]` |
| **R3** | Loopback `GET /api/git` + `POST /api/open-preview`; inject `DEVSHELL_API` |
| **R4** | `@devshell/client` stub package |
| **R5** | `flavor.json` → branded app name/icon + locked project + hide picker |
| **R6** | Git watch (dirty / ahead-behind); OAuth device flow for private repos |
| **R7** | Packaging / notarization / vendored Bun in app bundle |

---

## 9. Conversation / agent trail (source monorepo)

Cursor agent transcripts are UUIDs under the IDE project’s `agent-transcripts/` (cite as `[<title>](uuid)`). ADR lists:

| UUID | Topic |
| --- | --- |
| `8383090c-8afb-4e53-b5be-525b49211e1c` | P1 Deno clone→run; Electrobun assessed; P3 handoff |
| `098e15f5-0690-49dd-9437-e52ece942e49` | Electrobun portability / bun path |
| `80b8ba66-d43a-49a8-8dac-8ddfbb8ca0fd` | Electrobun bun resolve failure |
| `d9e0806a-6d73-4392-88f7-de2c0988a262` | Electrobun walkthroughs + logs |
| `ae551e88-ebe4-4f80-bac2-e9b8024b6428` | isomorphic-git clone cache |
| `4a0b6d62-d192-4111-a495-1f17b490a279` | Deno vs Electrobun comparison |
| `1cd0f917-83bf-45af-a2bb-4eca9ec62b36` | P3 works; preview chrome spike |
| `11779434-5b3f-4cdc-958a-af72134b9fa0` | Embedded browser vs simple preview |
| `8ccd8900-01cd-4ea2-97f9-c67f1b344121` | Revert chrome; P3 winner |

This design/handoff chat (CMS monorepo session) also covered:

- Schema-driven CRUD research → CMS builds own forms ([research 16](../authoring-shell-spec/research/16-schema-driven-crud-from-json-or-zod.md))  
- Zod `.meta()` flows into `toJSONSchema`  
- Form path: JSON Schema + meta → sjsf `uiSchema`; `/_cms` dev-only  
- Devshell ≠ `@cms` package; separate repo preferred; no `@cms` imports  
- `devshell.json`, flavors, loopback git/open-preview, `@devshell/client`  
- Prior art research → [`.scratch/devshell/research/01-…`](research/01-prior-art-local-repo-dev-orchestrators.md)  

Subagents that wrote research in that session: schema CRUD `0568e113-37af-4f2c-8f18-c3733676255d`; Devshell prior art `50c5018e-8feb-4207-9d54-bedf98530d15`.

---

## 10. Checklist for the initializing agent

1. [ ] Create empty git repo (name TBD: `devshell` or product name)  
2. [ ] Copy ADR 0001, research 01, this HANDOFF, P3 spike sources (no WIP tree)  
3. [ ] Make desktop app run standalone (fix paths that assume `astro-dev-cms-gui` root)  
4. [ ] Confirm smoke: clone Astro blog → bun install → URL → preview window  
5. [ ] Add `.gitignore` for clone caches / runtime files  
6. [ ] Document Deno ≥ 2.9 + optional vendored Bun  
7. [ ] Do **not** add `@cms/*` workspace dependencies  
8. [ ] Optionally note interoperability: projects may use `@devshell/client` + `/_cms` as a preview path  

---

## 11. Absolute paths (source machine — 2026-09-12)

Useful if the next agent still has this monorepo checked out:

```
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/.scratch/devshell/
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/.scratch/devshell/HANDOFF.md
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/.scratch/devshell/README.md
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/.scratch/devshell/research/01-prior-art-local-repo-dev-orchestrators.md
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/.scratch/prototype-clone-run-deno-bun/
/Users/giovanniabbatepaolo/Documents/GitHub/workshok/astro-dev-cms-gui/docs/adr/0001-deno-desktop-shell-bun-sidecar.md
```
