# Platform concerns: Windows, Linux, mobile (Deno Desktop + Bun + isomorphic-git)

**Question:** What is officially documented (and what is still unknown) about shipping Devshell on Windows, Linux, and mobile, given Deno Desktop + Bun sidecar + isomorphic-git?  
**Product frame:** Working name **Devshell**. Control UI is Deno Desktop; guest Project install/`dev` via embedded Bun; clone cache via isomorphic-git.  
**Method:** Primary sources only — Deno docs / denoland issues, Bun docs / install script, isomorphic-git docs / GitHub, plus OS path specs for data-root verification. Claims without a cite are marked **unknown / not documented**. Snapshot date: **2026-09-14**.

## Verdict

1. **Product scope (2026-09-14): desktop only.** iOS/Android are out of scope — see [CONTEXT.md](../CONTEXT.md). Research below still notes Deno’s “Not yet” for mobile so the constraint is documented; it is not a Devshell roadmap item.
2. **Deno Desktop officially targets macOS / Windows / Linux.** Official comparison table lists **iOS / Android: Not yet**.
3. **Packaging matrix is real for all three desktops** (`.app`/`.dmg`, Windows dir/`.msi`, Linux dir/AppImage/deb/rpm) with cross-compile via `--target` / `--all-targets`. One host exception: **`.dmg` requires a macOS host** (`hdiutil`).
4. **Devshell desktop portability (code):** PATH list separator and `bun.exe` lookup, OS clipboard helper (`clipboard.ts`), and Windows process kill without SIGTERM were added 2026-09-14. Bun is resolved via PATH / env / pinned Data-root download (no vendor scripts). Remaining packaging gaps (WebKitGTK vs CEF, Windows auto-update) are still open — see §7.
5. **Auto-update does not apply on Windows** (patches download/stage; launcher does not swap). Deno has **no native clipboard API** yet — Devshell uses OS clipboard CLIs plus webview `navigator.clipboard` fallback in the control UI.

---

## 1. Deno Desktop OS matrix

Sources: [Distribution](https://docs.deno.com/runtime/desktop/distribution/), [Backends](https://docs.deno.com/runtime/desktop/backends/), [Desktop overview](https://docs.deno.com/runtime/desktop/), [Comparison](https://docs.deno.com/runtime/desktop/comparison/), [Configuration](https://docs.deno.com/runtime/desktop/configuration/).

### Confirmed support

| OS | Architectures (official triples) | Source |
| --- | --- | --- |
| macOS | `aarch64-apple-darwin`, `x86_64-apple-darwin` | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| Windows | `x86_64-pc-windows-msvc` only (no Windows ARM triple listed) | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| Linux | `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| iOS / Android | **Not yet** | [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |

Feature availability: Deno v2.9.0+; configuration page notes it is **not in a stable release yet** and may change ([Configuration](https://docs.deno.com/runtime/desktop/configuration/)).

### Packaging outputs

| Platform | Default output | Other extensions | Notes | Source |
| --- | --- | --- | --- | --- |
| macOS | `MyApp.app/` | `.dmg` via `hdiutil` | `.app` has `Contents/MacOS/`, `Contents/Resources/`, optional `Frameworks/` (CEF) | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| Windows | `MyApp/` directory (`.bat` launcher + DLLs) | `.msi` (per-machine under `%ProgramFiles%\…`) | MSI authored in pure Rust; cross-compiles from any host | [Distribution](https://docs.deno.com/runtime/desktop/distribution/), [Configuration](https://docs.deno.com/runtime/desktop/configuration/) |
| Linux | `my-app/` directory (launcher script + `.so`) | `.AppImage`, `.deb`, `.rpm` | AppImage/deb/rpm assembled without external host tools; cross-compile OK | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |

**Cross-compile:** `deno desktop --target <triple>` or `--all-targets`; no local Rust/engine toolchain required — CLI downloads matching `denort` + backend archives ([Distribution](https://docs.deno.com/runtime/desktop/distribution/)).

**Host exception:** Icon assembly and Linux `.AppImage` work from any host; **macOS `.dmg` must be built on macOS** ([Distribution](https://docs.deno.com/runtime/desktop/distribution/)). Codesign with a real Developer ID also shells out to `codesign(1)` → macOS host ([Distribution](https://docs.deno.com/runtime/desktop/distribution/)).

**Doc tension (do not invent a resolution):** [Comparison](https://docs.deno.com/runtime/desktop/comparison/) (last updated 2026-06-25) still lists “Windows MSI and Linux `.deb` / `.rpm` installer outputs” under *What deno desktop doesn't have yet*, while [Distribution](https://docs.deno.com/runtime/desktop/distribution/) (last updated 2026-08-06) documents those formats as produced. Prefer **Distribution** for packaging claims; treat Comparison’s “doesn’t have” bullet as **stale relative to Distribution** until Deno reconciles the pages.

### Backends and OS engines

| Backend | Engine | Size / tradeoff | Source |
| --- | --- | --- | --- |
| `webview` (default) | **WKWebView** (macOS), **WebView2** (Windows), **WebKitGTK** (Linux) | Smallest; rendering varies by OS/version; no unified DevTools | [Backends](https://docs.deno.com/runtime/desktop/backends/) |
| `cef` | Bundled Chromium Embedded Framework | ~150 MB framework; identical rendering; DevTools / autoUpdate / tray / dock fully supported | [Backends](https://docs.deno.com/runtime/desktop/backends/) |
| `raw` | No web engine | Window/input/clipboard surface only; no `Deno.serve` auto-bind / bindings | [Backends](https://docs.deno.com/runtime/desktop/backends/) |

Devshell `apps/desktop/deno.json` sets `"backend": "webview"`.

### Host dependencies (webview)

| Platform | What Deno docs say | Extra primary evidence | Verdict |
| --- | --- | --- | --- |
| macOS | Uses WKWebView | — | System WebKit; extra package **not documented** as required |
| Windows | Uses WebView2 | — | Whether Evergreen **WebView2 Runtime** must be preinstalled is **not documented** on docs.deno.com |
| Linux | Uses WebKitGTK | denoland/deno [#35562](https://github.com/denoland/deno/issues/35562): `libwebkit2gtk-4.1.so.0: cannot open shared object file` when webview backend starts without the library | **Host WebKitGTK 4.1 shared lib required in practice** for webview; not spelled out as an install checklist in Backends docs |

CEF downloads a prebuilt backend archive (no local Chromium build) ([Backends](https://docs.deno.com/runtime/desktop/backends/)). Linux Wayland support for CEF/webview was landed via laufey bumps in denoland/deno ([#35425](https://github.com/denoland/deno/pull/35425), [#35485](https://github.com/denoland/deno/pull/35485)).

---

## 2. Platform-specific / OS-gated Deno Desktop APIs

| API / feature | Documented OS behavior | Source |
| --- | --- | --- |
| **`Deno.dock.setVisible` / dock menu / `reopen`** | **macOS only**; no-ops on Windows/Linux (fail gracefully) | [Tray and dock](https://docs.deno.com/runtime/desktop/tray_and_dock/) |
| **`Deno.dock.setBadge` / `bounce`** | Cross-platform with different effects (dock / taskbar flash / Linux urgency / title prefix) | [Tray and dock](https://docs.deno.com/runtime/desktop/tray_and_dock/) |
| **`Deno.Tray`** | macOS NSStatusItem, Windows NotifyIcon, Linux AppIndicator/KStatusNotifierItem (DE-dependent); constructor may yield `trayId === 0` → subsequent calls no-op | [Tray and dock](https://docs.deno.com/runtime/desktop/tray_and_dock/) |
| **Tray panel anchoring** | `getBounds()` can be `null`; **Linux cannot query icon position** → panel not anchored | [Tray and dock](https://docs.deno.com/runtime/desktop/tray_and_dock/) |
| **Window chrome** | `frameless`, `noActivate`, `transparentTitlebar` (blend title bar into content) — creation-only | [Windows API page](https://docs.deno.com/runtime/desktop/windows/) |
| **Full window transparency** | **Not documented** as a `BrowserWindow` option (only `transparentTitlebar`) | [Windows](https://docs.deno.com/runtime/desktop/windows/) |
| **Auto-update** | Apply + rollback: **macOS and Linux only**. Windows: download/stage only; “loaded DLL can't be replaced in place” → treat as **not supported** | [Auto-update](https://docs.deno.com/runtime/desktop/auto_update/), [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| **Native clipboard API** | **Not yet exposed.** Use Web `Clipboard` API from webview (`navigator.clipboard.writeText` / `readText`) | [Dialogs → Clipboard](https://docs.deno.com/runtime/desktop/dialogs/), [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| **Native file/folder pickers** | Not yet first-class; use `<input type="file">` or drag-drop | [Dialogs](https://docs.deno.com/runtime/desktop/dialogs/) |
| **Secure-storage API** | Listed as missing in Comparison | [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| **DevTools** | Unified mux: **CEF only** at this time | [Backends](https://docs.deno.com/runtime/desktop/backends/) |
| **Notarization** | Separate `notarytool` step (not one-click) | [Comparison](https://docs.deno.com/runtime/desktop/comparison/), [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| **Windows code signing** | Sign `.exe` / `denort.dll` externally (`signtool`); not automated by `deno desktop` | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |

---

## 3. Mobile (iOS / Android)

**Devshell product decision (2026-09-14):** out of scope — see [CONTEXT.md](../CONTEXT.md). No roadmap item; do not reopen ADR 0001 for phones.

Framework facts (why this is easy to keep out of scope):

| Claim | Source |
| --- | --- |
| Comparison table column **iOS / Android** for `deno desktop`: **Not yet** | [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| Same page lists iOS/Android targets under *What deno desktop doesn't have yet* | [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| Supported desktop OS row: **macOS / Windows / Linux — All three** (no mobile) | [Comparison](https://docs.deno.com/runtime/desktop/comparison/) |
| Distribution target triples: five desktop triples only | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| Bun install matrix: macOS, Linux, Windows only | [Bun Installation](https://bun.com/docs/installation) |

---

## 4. Bun sidecar

Sources: [Bun Installation](https://bun.com/docs/installation), [Bun Spawn / child process](https://bun.com/docs/runtime/child-process), Bun [install.ps1](https://github.com/oven-sh/bun/blob/main/src/cli/install.ps1) (via GitHub), [Building Windows](https://bun.com/docs/project/building-windows).

| Topic | Documented fact | Source |
| --- | --- | --- |
| Platforms | macOS, Linux, Windows | [Installation](https://bun.com/docs/installation) |
| Windows minimum | Windows 10 version **1809** or later | [Installation](https://bun.com/docs/installation) |
| Windows install | `powershell -c "irm bun.sh/install.ps1\|iex"` (also `bun.com/install.ps1`) | [Installation](https://bun.com/docs/installation) |
| Default install root | `$BUN_INSTALL` or else `~/.bun` / `${Home}\.bun` | [Installation](https://bun.com/docs/installation); install.ps1: `$BunRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { "${Home}\.bun" }` |
| Windows binary name | **`bun.exe`** under `%BUN_INSTALL%\bin\` | install.ps1 removes/tests `"${BunBin}\bun.exe"`; build docs output `bun.exe` ([Building Windows](https://bun.com/docs/project/building-windows)) |
| PATH (Unix) | `export PATH="$BUN_INSTALL/bin:$PATH"` (`:` separator) | [Installation](https://bun.com/docs/installation) |
| PATH (Windows) | Append `;\…\.bun\bin` via `[System.Environment]::SetEnvironmentVariable`; install.ps1 splits Path on **`;`** | [Installation](https://bun.com/docs/installation); install.ps1 `$Path = (Get-Env -Key "Path") -split ';'` |
| Kill API (Bun.spawn) | `proc.kill("SIGTERM")` supported in API; default timeout kill is SIGTERM | [Child process](https://bun.com/docs/runtime/child-process) |
| Windows spawn quirks (Bun) | PTY vs ConPTY differences; `windowsVerbatimArguments`; docs note e.g. `["bun", "exec", "yes"]` on Windows for some cases | [Child process](https://bun.com/docs/runtime/child-process) |
| Linux kernel | Recommends ≥5.6; runs as old as 3.10 with degradation; needs `unzip` for install script | [Installation](https://bun.com/docs/installation) |
| musl / Alpine | Separate musl binaries; glibc binaries need glibc ≥2.17 | [Installation](https://bun.com/docs/installation) |

**Deno-side kill (what Devshell uses):** `ChildProcess.kill` defaults to `SIGTERM` ([Deno API](https://docs.deno.com/api/deno/~/Deno.ChildProcess.prototype.kill)). On Windows, signals sent via `Deno.kill` **ultimately invoke `TerminateProcess`** ([OS signals tutorial](https://docs.deno.com/examples/os_signals_tutorial/)) — not Unix-style catchable SIGTERM for the child.

---

## 5. isomorphic-git (clone cache)

Devshell pins `npm:isomorphic-git@1.42.2` and uses Node `fs` + `isomorphic-git/http/node` (`apps/desktop/runner.ts`).

| Topic | What primary sources say | Relevance to clone cache | Source |
| --- | --- | --- | --- |
| `fs` contract | Needs Node-like `fs` / `fs.promises`; `readlink`/`symlink` **optional** unless repo contains symlinks | Clone of symlink-heavy repos needs working symlink APIs | [fs docs](https://isomorphic-git.org/docs/en/fs) |
| Symlink add on Windows | Historically wrote backslash targets from `fs.readlink` into blobs (must be POSIX `/`) — fixed/regressed across versions | Affects **add**/commit more than clone; still a Windows footgun if Devshell later writes git objects | [Issue #1381](https://github.com/isomorphic-git/isomorphic-git/issues/1381), [PR #1382](https://github.com/isomorphic-git/isomorphic-git/pull/1382) |
| Symlink create on Windows | Security advisory: Node `fs.symlink` on Windows **typically needs privilege** and often throws **`EPERM`** — clone/checkout of symlink trees may fail | Clone cache of repos with symlinks can break on Windows without Developer Mode / elevation | [GHSA-9qw7-j9xw-fv9c](https://github.com/isomorphic-git/isomorphic-git/security/advisories/GHSA-9qw7-j9xw-fv9c) |
| Win32 path resolution | Library has had regressions/fixes around `path.join` vs posix on Windows | Prefer staying on current patched release; don’t assume path bugs are gone forever | [PR #1937](https://github.com/isomorphic-git/isomorphic-git/pull/1937) (fix 1.26.2) |
| Long paths (`MAX_PATH`) | **Not documented** in isomorphic-git docs as a supported/handled feature | Whether clone into deep `LOCALAPPDATA\…\clones\…` trees hits Windows 260-char limits is **unknown / depends on Node/OS long-path policy**, not on isomorphic-git docs | — |
| UNC paths | Some path helpers historically note UNC limitations | Unlikely for local clone cache under `%LOCALAPPDATA%` | Community/code commentary; treat as low priority |

---

## 6. Map to current Devshell desktop code

Code under `apps/desktop/`. Status as of **2026-09-14** portability pass.

| Assumption | Location | Platform impact | Severity |
| --- | --- | --- | --- |
| Clipboard via **`clipboard.ts`** (`pbcopy` / `clip` / `wl-copy`·`xclip`·`xsel`) | `clipboard.ts` + `main.ts` `copyLogs` | OS CLI helpers; control UI also falls back to `navigator.clipboard` | **Addressed** (needs Linux helper installed, or webview fallback) |
| `pathListSeparator` + `commandPathNames` | `runner.ts` `whichOnPath` | Windows uses `;` and `bun.exe` / `node.exe` | **Addressed** |
| `BUN_INSTALL` / embedded candidates include **`bun.exe`** | `runner.ts` | Matches Windows Bun layout | **Addressed** |
| macOS bundle paths `../Resources/bin/bun`, `../MacOS/bun` | `runner.ts` | Matches Deno Desktop `.app` layout. Harmless no-ops on Win/Linux dir layouts | Packaging-aware (macOS); incomplete for Windows dir / Linux AppImage |
| `proc.kill()` on Windows, `SIGTERM` elsewhere | `runner.ts` `spawnLiving` | Windows still maps to TerminateProcess — abrupt, may orphan grandchildren | **Partial** |
| `isExecutableFile` skips Unix mode bits on Windows | `runner.ts` | Avoids false negatives on `bun.exe` | **Addressed** |
| Data root `darwin` / `windows` / `linux` | `paths.ts` | Correct against OS specs | OK |
| Backend `webview` | `deno.json` | Linux WebKitGTK host dep; Windows WebView2 Runtime **not documented** by Deno | Open packaging choice |
| isomorphic-git clone into data root | `runner.ts` | Symlink repos / long paths on Windows: see §5 | Conditional |

### `paths.ts` data root — verification

| OS | Code | Spec / primary source | Match? |
| --- | --- | --- | --- |
| macOS | `~/Library/Application Support/Devshell` | Apple: app data under `~/Library/Application Support/…` ([Mac OS Library directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html)). Convention prefers **bundle id** subfolder (`dev.devshell.desktop`); product name is common but looser | **Correct location**; naming is product-name not bundle-id |
| Windows | `%LOCALAPPDATA%\Devshell` with fallback `%USERPROFILE%\AppData\Local\Devshell` | `FOLDERID_LocalAppData` → `%LOCALAPPDATA%` (`%USERPROFILE%\AppData\Local`) ([Known Folder IDs](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)) | **Correct** |
| Linux (default branch) | `$XDG_DATA_HOME/devshell` or `~/.local/share/devshell` | XDG: `$XDG_DATA_HOME` default `$HOME/.local/share` ([Basedir spec](https://specifications.freedesktop.org/basedir-spec/latest/)) | **Correct** (lowercase `devshell` is fine on Linux) |

Also honors `DEVSHELL_DATA_DIR` override and `HOME` / `USERPROFILE` — sensible.

---

## 7. Prioritized gap list

### A. Windows — remaining after portability pass

| Priority | Gap | Why |
| --- | --- | --- |
| P1 | Process tree kill | `kill()` is still TerminateProcess; grandchildren / held ports possible |
| P1 | Packaged embed paths for Windows dir / MSI layout | Still primarily macOS `.app` Resources/MacOS candidates |
| P2 | Symlink-heavy git clones via isomorphic-git | Windows `EPERM` on symlink creation without privilege |
| P2 | Auto-update if product relies on `Deno.autoUpdate()` | Explicitly unsupported apply/swap on Windows |

### B. Linux — remaining

| Priority | Gap | Why |
| --- | --- | --- |
| P1 | Clipboard helpers may be missing | Needs `wl-copy` / `xclip` / `xsel`, else webview Clipboard API fallback |
| P1 | WebKitGTK for `webview` backend | Host `libwebkit2gtk-4.1` in practice ([#35562](https://github.com/denoland/deno/issues/35562)); or ship `cef` |
| P2 | Packaged embed paths for AppImage/dir layouts | Same as Windows packaging follow-up |
| P2 | Tray on minimal WMs | AppIndicator may be absent → silent tray no-op |

### C. Packaging-only (product ships after CI/signing work; code may already run under `deno desktop --hmr`)

| Gap | Notes |
| --- | --- |
| Per-OS `desktop.output` (`.app`/`.dmg`, dir/`.msi`, AppImage/deb/rpm) | Documented; not configured in Devshell yet |
| Cross-compile matrix + macOS-only `.dmg` / codesign / notarization | [Distribution](https://docs.deno.com/runtime/desktop/distribution/) |
| Windows Authenticode signing of launcher + `denort.dll` | External `signtool` |
| Embed Bun next to Windows/Linux layouts (not only `Resources`/`MacOS`) | Superseded for product default by pinned Data-root download; only relevant if re-embedding later |
| Linux: document WebKitGTK vs ship `cef` | Packaging/docs choice |
| Windows auto-update story | Full reinstall / external updater until Deno supports swap |

### D. Mobile (out of scope)

Documented for completeness only — not a Devshell workstream. Deno Desktop and Bun are desktop-OS-only today; product scope matches that ([CONTEXT.md](../CONTEXT.md)).

---

## Sources index

| Area | URLs |
| --- | --- |
| Deno Desktop | https://docs.deno.com/runtime/desktop/ · https://docs.deno.com/runtime/desktop/distribution/ · https://docs.deno.com/runtime/desktop/backends/ · https://docs.deno.com/runtime/desktop/comparison/ · https://docs.deno.com/runtime/desktop/configuration/ · https://docs.deno.com/runtime/desktop/tray_and_dock/ · https://docs.deno.com/runtime/desktop/auto_update/ · https://docs.deno.com/runtime/desktop/dialogs/ · https://docs.deno.com/runtime/desktop/windows/ |
| Deno signals / kill | https://docs.deno.com/examples/os_signals_tutorial/ · https://docs.deno.com/api/deno/~/Deno.ChildProcess.prototype.kill |
| denoland evidence | https://github.com/denoland/deno/issues/35562 · https://github.com/denoland/deno/pull/35425 · https://github.com/denoland/deno/pull/35485 |
| Bun | https://bun.com/docs/installation · https://bun.com/docs/runtime/child-process · https://bun.com/docs/project/building-windows · https://github.com/oven-sh/bun/blob/main/src/cli/install.ps1 |
| isomorphic-git | https://isomorphic-git.org/docs/en/fs · https://github.com/isomorphic-git/isomorphic-git/issues/1381 · https://github.com/isomorphic-git/isomorphic-git/security/advisories/GHSA-9qw7-j9xw-fv9c |
| OS path specs | https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html · https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid · https://specifications.freedesktop.org/basedir-spec/latest/ |
