# Prior art: local repo → install → run → preview orchestrators

**Question:** What products already cover substantial parts of the **Devshell** loop (desktop app clones a GitHub repo, installs/runs `dev` with an embedded toolchain, opens native preview window(s) on a detected localhost URL, driven by a repo-root config, with optional branded single-repo builds)?  
**Product frame:** Working name **Devshell**. Deno Desktop + Bun sidecar + isomorphic-git. Guest apps may open any preview path (including something like `/_cms`); Devshell does not own CMS packages.  
**Method:** Official product docs, first-party sites, and GitHub READMEs. Stars/licenses from GitHub API as of **2026-09-12**. Secondary blog roundups used only as discovery pointers, not as claim sources.

## Verdict

1. **No primary-source product ships the full Devshell composition.** Pieces are common; the end-to-end stack—**desktop shell + pure-JS git sync (no system git) + embedded JS package manager + stdout/URL detection + OS-owned preview window(s) + repo-root launcher config + optional white-label single-repo binary + loopback API for the cloned app**—does not appear as one product.
2. **Closest product category is branded local CMS/env desktops** ([Local](https://localwp.com/), [WordPress Studio](https://developer.wordpress.com/studio/), [Laravel Herd](https://herd.laravel.com/)): download an app, get a stack, open a site. They prove client-friendly distribution—but they are **stack-locked** (WordPress/PHP), clone **sites/archives** (or parked folders), not arbitrary GitHub JS repos, and preview is usually the **system browser** / `.test` domains, not multi-window shell-owned previews driven by `bun run dev`.
3. **Closest “generic multi-repo launcher” peers** are hobby Electron/Tauri tools ([launcher.dev](https://github.com/wize-pro/launcher.dev), [Localhost Hub](https://github.com/MadsenDev/localhost-hub), [PortPilot](https://github.com/m4cd4r4/PortPilot)): scan folders, run scripts, open browser tabs, optional `.launcher.yml` / git status. They **assume Node/git already installed**, do not clone from a locked GitHub URL for non-devs, and do not embed Bun.
4. **Cloud / container IDEs** (Codespaces, Gitpod, StackBlitz, DevPod) own clone→install→run→preview for **developers in an editor**. That is a crowded, mature space—and the wrong UX for “end client never selects a repo.”
5. **“Nobody thought of this” is not fair.** Novelty is **composition + distribution**: LocalWP-like packaging for a **git URL + JS monorepo `dev` server**, with **preview windows as the product surface**, not IDE chrome. Individual building blocks (Nativefier wrappers, Velocity clone→editor, isomorphic-git, `Procfile`/`devcontainer.json`/`herd.yml`) are well-trodden.

---

## Taxonomy

| Bucket | What it does | Typical audience | Overlap with Devshell |
| --- | --- | --- | --- |
| **A. Branded local stack desktops** | Ship PHP/MySQL/Nginx (or WASM WP); create/import sites; open URL | Agencies, WP/Laravel clients | Distribution + “no toolchain install” story |
| **B. Docker/env orchestrators** | Repo config → containers; `ddev start` / `lando start` | Devs on CMS stacks | Repo-root config; not desktop preview-first |
| **C. Local project launchers / dashboards** | Scan disk; run npm scripts; ports UI; tray | Devs with many repos | Control/logs/status chrome; multi-repo picker |
| **D. Clone → open editor** | Clone GitHub → VS Code/Cursor | Devs | Clone UX only |
| **E. Localhost scanners / preview wrappers** | Find ports; phone-frame Electron on `localhost` | Devs polishing UI | Preview window idea; no clone/install |
| **F. Cloud / browser IDEs** | Clone + install + preview in Codespace/WebContainer | Devs | Full loop, wrong place (cloud/browser IDE) |
| **G. Site wrappers (white-label URL)** | Electron/Tauri around a fixed URL | End users of a hosted site | Branded binary; **no** git/install/run |
| **H. Repo-root config conventions** | Declare install/run/ports for platforms | Devs / CI / PaaS | Shape of `devshell.json` |

---

## Comparison matrix

Legend: **Y** = first-party docs/README claim it; **P** = partial / adjacent; **N** = not in scope. “No system Node/git” means the **product claims** the user need not install Node and/or git for the happy path.

| Product | Clone/sync | Install/run | Preview window(s) | Repo config | Git status → app | Branded single-repo | No system Node/git | Maturity | Stack / license |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Devshell (target)** | Y (isomorphic-git) | Y (embedded Bun) | Y (native windows) | Y (`devshell.json`) | Y (loopback API) | Y (flavor) | Y (goal) | early | Deno Desktop + Bun |
| **[Local (LocalWP)](https://localwp.com/)** | P (import zip / clone site files; Connect pull) | Y (ships PHP/MySQL/Nginx/Apache) | P (opens site; Live Links) | N (app-managed sites) | N | P (WP-only product brand) | Y (no PHP stack install) | Product, 1M+ downloads claimed | Desktop; proprietary |
| **[WordPress Studio](https://developer.wordpress.com/studio/)** | P (import / Sync pull; not “paste any git URL”) | Y (Playground / no external deps) | P (local site + cloud preview links) | P (Blueprints) | N | Y (WP-branded desktop) | Y | Product; ~516★ OSS | Electron; GPL-2.0 |
| **[Laravel Herd](https://herd.laravel.com/)** | N (park/link folders; docs say clone yourself) | Y (ships PHP/nginx/Node/Composer) | P (`herd open` → browser) | Y (`herd.yml`) | N | P (Laravel-branded) | Y for PHP; ships Node | Product (Free/Pro) | Native macOS/Windows |
| **[DDEV](https://github.com/ddev/ddev)** | P (works from cloned repos) | Y (Docker) | P (`ddev launch` → browser) | Y (`.ddev/config.yaml`) | N | N | N (needs Docker + usually git) | ~3.8k★ | Go; Apache-2.0 |
| **[Lando](https://github.com/lando/lando)** | P | Y (Docker) | P (proxy URLs) | Y (`.lando.yml`) | N | N | N (Docker) | ~4.2k★ | MIT |
| **[launcher.dev](https://github.com/wize-pro/launcher.dev)** | N (scan existing folders) | Y (run cmds; needs host toolchains) | P (open browser on `port`) | Y (`.launcher.yml`) | N | N | N (needs Node 18+) | ~1★; pre-1.0 | Electron; MIT |
| **[Localhost Hub](https://github.com/MadsenDev/localhost-hub)** | N | Y (scripts; PM detection) | P (ports → localhost URLs) | P (app config, not repo SoT) | Y (git2; health view) | N | N (Node 20+ + Git to use) | ~7★; 0.9.x | Tauri 2; MIT |
| **[PortPilot](https://github.com/m4cd4r4/PortPilot)** | N | P (can start/kill) | P (open localhost) | N | N | N | N | ~12★ | Electron; MIT |
| **[localhost-dashboard](https://github.com/Tanjim-Islam/localhost-dashboard)** | N | N (scan only) | P (open browser) | N | N | N | N | ~1★ | Electron |
| **[Velocity](https://github.com/ose-id/velocity)** | Y (git clone) | N | N (opens editor) | N | N | N | N (needs git + editors) | ~5★; hobby | Desktop; MIT |
| **[launch](https://github.com/adamarutyunov/launch)** (`launch.yml`) | N | Y (process manager) | N (TUI logs) | Y (`launch.yml`) | N | N | N | ~23★ | Go TUI; MIT |
| **[GitHub Desktop](https://github.com/desktop/desktop)** | Y | N | N | N | Y (GUI) | N | N (git GUI, not JS runtime) | ~21.8k★ | Electron; MIT |
| **[GitButler](https://github.com/gitbutlerapp/gitbutler)** | Y | N | N | N | Y | N | N (uses **system git** for fetch/push) | ~21.7k★ | Tauri |
| **[Expo Orbit](https://docs.expo.dev/build/orbit/)** | N | P (install builds on simulators) | P (device/sim, not web preview) | N | N | N | N (needs Android SDK / Xcode) | ~874★ | Menu-bar app; MIT |
| **Phone-frame wrappers** ([vibe-dev-companion](https://github.com/pangerlkr/vibe-dev-companion) ~1★; Desktop Go / Expo Electron companions) | N | N | Y (Electron on localhost) | N | N | N | N | Hobby | Electron |
| **[Nativefier](https://github.com/nativefier/nativefier)** | N | N | Y (wraps URL) | N | N | Y (custom name/icon) | N (build-time Node) | ~35.3k★; **archived** | Electron; MIT |
| **[GitHub Codespaces](https://docs.github.com/en/codespaces/overview)** | Y | Y | P (editor preview / forwarded ports) | Y (`devcontainer.json`) | Y (in IDE) | N | Y (cloud VM) | Product | Cloud |
| **[Gitpod](https://www.gitpod.io/docs/references/gitpod-yml)** | Y | Y (`tasks.init` / `command`) | P (`ports.onOpen: open-preview`) | Y (`.gitpod.yml`) | Y | N | Y (cloud) | ~13.8k★ | Cloud; AGPL-3.0 |
| **[DevPod](https://devpod.sh/docs/what-is-devpod)** | Y | Y (devcontainer) | P (IDE preview) | Y (`devcontainer.json`) | Y | N | P (local Docker for local provider) | ~15.2k★ | Desktop+CLI; MPL-2.0 |
| **[StackBlitz](https://developer.stackblitz.com/guides/user-guide/what-is-stackblitz)** | Y (from GitHub) | Y (WebContainers) | Y (in-browser) | P (project files) | P | N | Y (browser) | Product; webcontainer-core ~4.6k★ | Browser WASM |
| **[Devbox](https://github.com/jetify-com/devbox)** | N | Y (Nix-based env) | N | Y (`devbox.json`) | N | N | P (ships toolchains via Nix) | ~12.4k★ | CLI; Apache-2.0 |

---

## Bucket notes (primary sources)

### A. Branded local stack desktops (strongest *product* analogues)

**Local (LocalWP)** — First-party positioning: one-click local WordPress with SSL, hot-swap PHP/NGINX/Apache, import/export zips, Blueprints, Local Connect to Flywheel/WP Engine, Live Links for sharing ([features](https://localwp.com/features/), [site](https://localwp.com/)). “Clone” means **clone a Local site** (files + DB + URL rewrite), not `git clone` of an arbitrary repo. Closest proof that **non-terminal users will download a desktop app to run a site**.

**WordPress Studio (Automattic)** — OSS Electron app: “requires no external dependencies,” powered by WordPress Playground; Sync, cloud preview sites, Studio CLI ([README](https://raw.githubusercontent.com/Automattic/studio/trunk/README.md), [docs](https://developer.wordpress.com/docs/developer-tools/studio/), [product](https://developer.wordpress.com/studio/)). Same category as Local, with a modern WASM runtime story. Still **WordPress-shaped**, not “any Astro git URL.”

**Laravel Herd** — Native app ships PHP, nginx, dnsmasq, Node, Composer; parks `~/Herd` → `*.test`; `herd open` opens the browser ([install docs](https://herd.laravel.com/docs/macos/getting-started/installation), [Laravel guide](https://herd.laravel.com/docs/macos/guides/laravel)). Explicitly: existing apps are **checked out with system git**, then linked. **`herd.yml`** shares PHP version, TLS, aliases, Pro services (`herd init`) ([herd.yml docs](https://herd.laravel.com/docs/macos/sites/herd-yaml)). Excellent **repo-root config** prior art for team onboarding; not a git+preview orchestrator.

### B. Docker/env orchestrators

**DDEV** — “Docker-based local PHP+Node.js web development environments”; per-project config in git; `ddev start` / `ddev launch` ([README](https://raw.githubusercontent.com/ddev/ddev/main/README.md)). Requires a Docker provider. Crowded, mature CMS-dev space.

**Lando** — Landofile (`.lando.yml`) + recipes (Drupal, WP, Laravel, …) ([README](https://raw.githubusercontent.com/lando/lando/main/README.md)). Same bucket as DDEV: powerful for teams, heavy for “client downloads one binary.”

### C. Local project launchers / dashboards (crowded hobby space)

**launcher.dev (Dev Launcher)** — Scan `devRoots`, auto-detect project types, Electron tray or web UI on loopback `:4242`, optional **`.launcher.yml`** with `commands.*.cmd` + `port` ([README](https://raw.githubusercontent.com/wize-pro/launcher.dev/main/README.md), [example](https://raw.githubusercontent.com/wize-pro/launcher.dev/main/example.launcher.yml)). Security model: loopback-only, no auth—same caution as a Devshell loopback API. **Closest config cousin to `devshell.json` among hobby launchers.** Does not clone; requires Node.

**Localhost Hub** — Tauri “mission control”: discover projects, workspaces with dependency order, merged logs, **stdout URL scraping**, ports, **git hygiene**, package install via detected PMs ([README](https://raw.githubusercontent.com/MadsenDev/localhost-hub/main/README.md)). Strong overlap on control/logs/git status; still assumes a pre-existing working tree and host toolchains.

**PortPilot / localhost-dashboard** — Port scanners + open-in-browser ([PortPilot](https://github.com/m4cd4r4/PortPilot), [localhost-dashboard](https://github.com/Tanjim-Islam/localhost-dashboard)). Useful UX references; not orchestrators.

**launch (`launch.yml`)** — TUI process manager with `ready_check`, `depends_on`, multi-project sidebar ([README](https://raw.githubusercontent.com/adamarutyunov/launch/main/README.md)). Config shape relevant; no desktop preview windows.

### D. Clone → open editor

**Velocity** — “Quickly clone Git repositories and open them in your favorite editor” (VS Code, Cursor, Windsurf); Windows-first ([README](https://github.com/ose-id/velocity), [site](https://velocity.ose.web.id/)). Stops at the editor. Tiny maturity signal (~5★).

**GitHub Desktop** — Clone/commit/push GUI (~21.8k★); no install/run/preview product loop ([repo](https://github.com/desktop/desktop)).

### E. Preview wrappers

Electron apps that wrap `http://localhost:…` in a phone frame (Expo Desktop Go companions; vibe-dev-companion) validate **preview-as-window** without owning clone/install. **Expo Orbit** is a polished menu-bar tool for **simulator/device** installs from EAS—not web `dev` servers ([Expo Orbit docs](https://docs.expo.dev/build/orbit/), [README](https://raw.githubusercontent.com/expo/orbit/main/README.md)).

### F. Cloud / browser IDEs (crowded; different job)

**Codespaces** — Cloud Docker env from `devcontainer.json`; browser or VS Code ([overview](https://docs.github.com/en/codespaces/overview)).

**Gitpod** — `.gitpod.yml` `tasks` + `ports` with `onOpen: open-preview | open-browser | notify | ignore` ([reference](https://www.gitpod.io/docs/references/gitpod-yml)). Closest **declarative “open preview when port ready”** semantics for Devshell’s URL/window behavior—but in a cloud IDE.

**DevPod** — Client-only Codespaces alternative; same `devcontainer.json`; desktop app ([docs](https://devpod.sh/docs/what-is-devpod), [README](https://raw.githubusercontent.com/loft-sh/devpod/main/README.md)).

**StackBlitz** — WebContainers: Node + git **in the browser tab**; clone from GitHub; in-tab preview ([What is StackBlitz?](https://developer.stackblitz.com/guides/user-guide/what-is-stackblitz)). Proves “no local Node” for **devs in a browser**, not a native multi-window desktop for clients.

### G. White-label URL wrappers

**Nativefier** — CLI to wrap any URL as Electron app with custom name/icon; **unmaintained/archived** ([README](https://raw.githubusercontent.com/nativefier/nativefier/master/README.md)). Spiritual ancestor of “branded single-site binary,” but wraps a **running URL**, not a repo lifecycle. Newer Tauri/Electron builders continue the same pattern—still not clone→install→run.

### H. Repo-root config conventions (shape of `devshell.json`)

| File | Owner | Declares | Relevance |
| --- | --- | --- | --- |
| **`.launcher.yml`** | launcher.dev | Commands, ports, labels | Closest hobby launcher schema |
| **`herd.yml`** | Laravel Herd | PHP version, TLS, aliases, services | Team “one command to set up site” |
| **`.ddev/config.yaml` / `.lando.yml`** | DDEV / Lando | Full stack services | Heavy env; not JS-dev-server-first |
| **`devcontainer.json`** | containers.dev / Codespaces / DevPod | Image, features, lifecycle, ports | Industry standard for **reproducible env**; IDE-centric |
| **`.gitpod.yml`** | Gitpod | `tasks`, `ports.onOpen` | Preview-on-port policy |
| **`Procfile`** | [Heroku](https://devcenter.heroku.com/articles/procfile) | Process types (`web: …`) | Minimal run command vocabulary |
| **`railway.toml` / `railway.json`** | [Railway](https://docs.railway.com/reference/config-as-code) | Build/start/healthcheck (deploy-time) | Deploy, not local desktop |
| **`netlify.toml`** | [Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/) | Build/publish/redirects | Deploy/build |
| **`turbo.json`** | [Turborepo](https://turbo.build/repo/docs/reference/configuration) | Task graph/cache | Monorepo tasks, not desktop windows |
| **`launch.yml`** | launch TUI | Processes, ready checks | Readiness polling pattern |
| **`devbox.json`** | Devbox | Nix packages / shells | Toolchain pinning without Docker |

**isomorphic-git** (~8.4k★, MIT) documents pure-JS `clone` without a system git binary ([clone API](https://isomorphic-git.org/docs/en/clone))—a **library**, not a product, but it underpins Devshell’s “no system git” claim and is uncommon among desktop products above (GitButler still shells out to system git for fetch/push per [their docs](https://docs.gitbutler.com/troubleshooting/fetch-push)).

---

## White space vs crowded space

### Crowded

- **Cloud/browser “open this repo and get a running preview”** (Codespaces, Gitpod, StackBlitz, DevPod).
- **Docker PHP/CMS local envs** (DDEV, Lando, Local, Studio, Herd-class tools).
- **Dev multi-repo dashboards** (launcher.dev, Localhost Hub, PortPilot).
- **Wrap a URL as a desktop app** (Nativefier lineage).

### White space (where Devshell sits)

1. **Native desktop that treats a GitHub URL as the unit of product**, not a folder the user already cloned—especially a **locked URL** for end clients (no repo picker).
2. **Embedded JS toolchain (Bun) + pure-JS git** so the happy path needs neither Node nor git on PATH—Herd/Studio do this for **PHP/WASM WP**, not for arbitrary `package.json` / Astro monorepos.
3. **Shell-owned multi-window preview** (control/logs vs site vs `/_cms`) rather than “open Chrome” or “open VS Code Simple Browser.”
4. **Thin `@devshell/client` / loopback contract** so the **running site** can ask the shell for git status / open-preview—rare outside IDE extension APIs; hobby launchers expose loopback APIs for **the launcher UI**, not for the guest app.
5. **Config that is launcher-shaped** (install, scripts, url, windows, git watch)—closer to `.launcher.yml` + Gitpod `ports.onOpen` than to `devcontainer.json` or `netlify.toml`.

### Composition novelty (honest framing)

| Claim | Fair? |
| --- | --- |
| “Nobody clones repos in a desktop app” | **No** — Velocity, GitHub Desktop, GitButler, cloud IDEs |
| “Nobody embeds a toolchain in a desktop app” | **No** — Herd, Local, Studio, (partially) StackBlitz |
| “Nobody opens a preview on localhost” | **No** — Gitpod `open-preview`, Expo Orbit, phone-frame Electron toys, every IDE |
| “Nobody has repo-root run config” | **No** — see table H |
| “Nobody ships **this combination** for **JS git-URL apps** aimed at **non-dev clients** with **branded single-repo builds**” | **Yes — that composition is the white space** |

---

## Relevance to Devshell design

| Design choice | Borrow from | Reject / differentiate |
| --- | --- | --- |
| Desktop packaging for non-devs | Local, WordPress Studio, Herd | Don’t become WordPress/PHP-only |
| Branded single-repo flavor | Nativefier (name/icon); Studio’s single-purpose brand | Don’t stop at wrapping a production URL |
| `devshell.json` | `.launcher.yml` + `herd.yml` + Gitpod `ports`/`tasks` | Don’t adopt full `devcontainer.json` / Docker as v1 requirement |
| Preview windows | Gitpod `onOpen: open-preview`; phone-frame wrappers | Don’t rebuild full browser chrome (matches ADR) |
| Control + logs chrome | Localhost Hub / launcher.dev | Don’t compete as generic “all my repos” dashboard unless shipping multi-repo flavor |
| No system git | isomorphic-git docs; contrast GitButler | Keep auth story (device OAuth) explicit |
| No system Node | Herd/Studio “ship the runtime”; StackBlitz WebContainers | Prefer **embedded Bun sidecar** (ADR) over browser WASM for native windows |
| Loopback API + client package | launcher.dev loopback security notes | Scope API to guest app needs (git status, open-preview), not remote RCE |
| CMS preview path | — | Stay orchestration-only; `/_cms` is just another URL (product constraint) |

**Practical takeaway:** Pitch Devshell as **“LocalWP for a git-backed JS site”** (distribution metaphor) plus **“Gitpod preview semantics on the desktop”** (runtime metaphor)—not as a new IDE and not as another port scanner. Defend novelty on **composition and the branded client flavor**, not on any single feature.

---

## Sources

### Branded local stacks
- Local: [localwp.com](https://localwp.com/), [features](https://localwp.com/features/), [import docs](https://localwp.com/help-docs/getting-started/how-to-import-a-wordpress-site-into-local/), [Blueprints](https://localwp.com/help-docs/local-features/how-to-use-blueprints/)
- WordPress Studio: [product](https://developer.wordpress.com/studio/), [docs](https://developer.wordpress.com/docs/developer-tools/studio/), [GitHub README](https://raw.githubusercontent.com/Automattic/studio/trunk/README.md) (~516★, GPL-2.0)
- Laravel Herd: [site](https://herd.laravel.com/), [install](https://herd.laravel.com/docs/macos/getting-started/installation), [herd.yml](https://herd.laravel.com/docs/macos/sites/herd-yaml)

### Docker / env
- DDEV: [README](https://raw.githubusercontent.com/ddev/ddev/main/README.md) (~3.8k★, Apache-2.0)
- Lando: [README](https://raw.githubusercontent.com/lando/lando/main/README.md) (~4.2k★, MIT)

### Launchers / dashboards / clone tools
- launcher.dev: [README](https://raw.githubusercontent.com/wize-pro/launcher.dev/main/README.md), [example.launcher.yml](https://raw.githubusercontent.com/wize-pro/launcher.dev/main/example.launcher.yml) (~1★, MIT)
- Localhost Hub: [README](https://raw.githubusercontent.com/MadsenDev/localhost-hub/main/README.md) (~7★, MIT)
- PortPilot: [GitHub](https://github.com/m4cd4r4/PortPilot) (~12★, MIT)
- Velocity: [GitHub](https://github.com/ose-id/velocity), [site](https://velocity.ose.web.id/) (~5★, MIT)
- launch: [README](https://raw.githubusercontent.com/adamarutyunov/launch/main/README.md) (~23★, MIT)
- GitHub Desktop: [desktop/desktop](https://github.com/desktop/desktop) (~21.8k★, MIT)
- GitButler: [docs fetch/push](https://docs.gitbutler.com/troubleshooting/fetch-push), [guide](https://docs.gitbutler.com/guide) (~21.7k★)

### Preview / device tools
- Expo Orbit: [docs](https://docs.expo.dev/build/orbit/), [README](https://raw.githubusercontent.com/expo/orbit/main/README.md) (~874★, MIT)
- vibe-dev-companion: [GitHub](https://github.com/pangerlkr/vibe-dev-companion) (~1★, MIT)

### Cloud / browser / wrappers
- Codespaces: [overview](https://docs.github.com/en/codespaces/overview)
- Gitpod: [`.gitpod.yml` reference](https://www.gitpod.io/docs/references/gitpod-yml) (~13.8k★, AGPL-3.0)
- DevPod: [what is DevPod](https://devpod.sh/docs/what-is-devpod), [README](https://raw.githubusercontent.com/loft-sh/devpod/main/README.md) (~15.2k★, MPL-2.0)
- StackBlitz: [What is StackBlitz?](https://developer.stackblitz.com/guides/user-guide/what-is-stackblitz); [webcontainer-core](https://github.com/stackblitz/webcontainer-core) (~4.6k★, MIT)
- Nativefier: [README](https://raw.githubusercontent.com/nativefier/nativefier/master/README.md) (~35.3k★, MIT, archived)
- isomorphic-git: [clone](https://isomorphic-git.org/docs/en/clone) (~8.4k★, MIT)

### Config conventions
- Procfile: [Heroku Dev Center](https://devcenter.heroku.com/articles/procfile)
- Railway config-as-code: [docs](https://docs.railway.com/reference/config-as-code)
- netlify.toml: [Netlify docs](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- turbo.json: [Turborepo config](https://turbo.build/repo/docs/reference/configuration)
- Devbox: [jetify-com/devbox](https://github.com/jetify-com/devbox) (~12.4k★, Apache-2.0)

### Internal
- ADR: [`docs/adr/0001-deno-desktop-shell-bun-sidecar.md`](../docs/adr/0001-deno-desktop-shell-bun-sidecar.md)
