# Roadmap

Ordered product phases for Devshell. Platform facts live in [research/02-platform-specific-windows-linux-mobile.md](../research/02-platform-specific-windows-linux-mobile.md); domain language in [CONTEXT.md](../CONTEXT.md).

## Near term (before / alongside R2)

| Item | Notes |
| --- | --- |
| **Process-tree kill** | **Done (Unix verified):** `os/process-host-posix` (`detached` + group `SIGTERM`→`SIGKILL`). **Windows v1:** `taskkill /T /F` in `os/process-host-windows` (smoke when Win CI exists). Job Object FFI only if orphans remain. |

## Phases

| Phase | Status | Deliverable |
| --- | --- | --- |
| **R0** | Done | Standalone repo; Deno Desktop + Bun sidecar + isomorphic-git; Astro blog happy path / smokes |
| **R1** | Done | CMS-only schema inspect removed from the default product path |
| **R2** | Next | Read repo-root `devshell.json`; multi-window from `windows[]` (defaults if missing) |
| **R3** | Open | Loopback API: `GET /api/git`, `POST /api/open-preview`; inject `DEVSHELL_API` (and/or `.devshell/runtime.json`) into the Guest app |
| **R4** | Open | `@devshell/client` — types + thin fetch helpers; no-op when Devshell absent |
| **R5** | Deferred | Flavors (`flavor.json`): branded name/icon, locked Project URL, hide picker — see Deferred |
| **R6** | Open | Git watch (dirty / ahead-behind); GitHub OAuth **device flow** for private repos (token in OS keychain; `onAuth` for isomorphic-git) |
| **R7** | Open | Public desktop artifacts without paid signing first: `.app` / Windows app dir / AppImage (or zip). **Bun download (done):** pinned Bun into the data root on first launch when PATH / env / vendor are absent. Still open: packaging outputs + Gatekeeper / SmartScreen “Open anyway” docs for unsigned builds |

## Deferred

Decide or schedule later — not blocking R2–R4.

| Topic | Intent when revisited |
| --- | --- |
| **Flavors (R5)** | Branded single-repo builds; paused until the generic multi-project loop is solid |
| **Code signing / notarization** | Optional polish for fewer OS warnings. Public releases can ship unsigned; users dismiss Gatekeeper / SmartScreen once |
| **Auto-update (`Deno.autoUpdate`)** | Not needed for now. Windows apply/swap is limited in Deno Desktop anyway |
| **webview vs CEF** | Keep `webview` until Linux WebKitGTK friction forces CEF (larger binary, consistent Chromium) |
| **Richer installers** | `.dmg` / `.msi` / `.deb` / `.rpm` after simple app artifacts work |
| **Win / Linux CI smokes** | Run `smoke:resolve` + `smoke:pipeline` on those OSes before leaning on packaged releases |
| **isomorphic-git + Windows symlinks** | Handle if real Projects hit `EPERM`; depth-1 clone + materialize may be enough |
| **System tray** | Not used yet; Linux tray is DE-dependent when added |
| **Mobile (iOS / Android)** | Out of scope — see [CONTEXT.md](../CONTEXT.md) |
