# Deno Desktop shell + Bun sidecar (not Electrobun)

We need a desktop authoring shell that clones a GitHub Astro repo, installs deps, runs the
dev server, and opens a controllable preview for editors — as a portable single binary where
possible, without requiring the client to install Node/npm/git. After three spikes, we adopt
**Deno Desktop** as the shell (control + preview windows) and an **embedded Bun CLI** as the
install/run/schema-inspect sidecar. Electrobun is rejected as the product shell.

**Status:** accepted

**Spike artifact (source monorepo):** `.scratch/prototype-clone-run-deno-bun/`  
**Product home:** `apps/desktop/` (`deno task desktop`)

## Considered options

1. **Deno Desktop alone** (P1 — `.scratch/prototype-clone-run/`) — clone→install→run→native
   webview worked and was straightforward, but install/run still leaned on the host package
   manager / Node story for real Astro projects.
2. **Electrobun + embedded Bun** (P2 — `.scratch/prototype-clone-run-electrobun/`) — aimed at
   “download a binary and go,” but the shell was harder to land (packaging path bugs such as
   resolving a *directory* named `bun` with EACCES, missing walkthrough/log wiring) while the
   Deno path stayed simpler.
3. **Deno Desktop + Bun sidecar** (P3 — chosen) — keep Deno’s control/preview windows; ship or
   PATH-resolve a real Bun *executable* for `bun install` / `bun run dev` / schema inspect;
   sync repos with isomorphic-git (no system git) into a durable WIP clone cache.

## Decision details (locked in spikes)

- **Shell = Deno Desktop**, not Electrobun and not Electron/CEF for now. An in-window
  Chromium rectangle is not a strict requirement: editors need a preview window for pages,
  not a full embedded browser product ([split / CEF / Electron discussion](11779434-5b3f-4cdc-958a-af72134b9fa0)).
- **Toolchain = Bun sidecar** (`bunEngine.source`: `embedded` | `path-which`). Never treat a
  directory named `bun` as the CLI (Electrobun packaging lesson).
- **Clone = isomorphic-git cache** under WIP + `clones-registry.json`, materialize work dirs
  for install/run ([cache plan](ae551e88-ebe4-4f80-bac2-e9b8024b6428), ported into P3).
- **Preview = second `BrowserWindow`** driven by `navigate(url)` / `reload` / show-focus.
  Controllable enough for “preview this entry.” Fake side-by-side via `setSize` /
  `setPosition` is fine; no native split pane.
- **Do not** rebuild mini-browser chrome (URL bar, back/forward, same-origin `/__dev` proxy).
  Deno has no `goBack`/`goForward`; `executeJs` against the Astro origin was unreliable for
  URL tracking. That chrome was tried and **reverted** once the product need was clarified
  ([winner chat](8ccd8900-01cd-4ea2-97f9-c67f1b344121)).

## Consequences

- Product shell follows P3’s shape; P1/P2 remain scratch references, not the path forward.
- Portability story is “Deno-packaged app + vendored Bun binary (+ isomorphic-git),” not
  “Electrobun host.” Packaging/notarization still to do.
- Preview UX is editor-driven URL navigation, not a synced browsing chrome.
- Window layout can approximate split view with two OS windows; users can still separate them.

## Conversation trail

- [P1 Deno Desktop clone→run + schema inspect; Electrobun assessed; P3 handoff](8383090c-8afb-4e53-b5be-525b49211e1c)
- [Electrobun portability / bun path resolution](098e15f5-0690-49dd-9437-e52ece942e49)
- [Electrobun bun resolve failure](80b8ba66-d43a-49a8-8dac-8ddfbb8ca0fd)
- [Electrobun walkthroughs + logs](d9e0806a-6d73-4392-88f7-de2c0988a262)
- [isomorphic-git clone cache](ae551e88-ebe4-4f80-bac2-e9b8024b6428)
- [Deno vs Electrobun comparison](4a0b6d62-d192-4111-a495-1f17b490a279)
- [P3 Deno+Bun: “works perfectly” / “runs very nice”; preview chrome spike](1cd0f917-83bf-45af-a2bb-4eca9ec62b36)
- [Embedded browser vs simple preview](11779434-5b3f-4cdc-958a-af72134b9fa0)
- [Revert chrome; controllable preview; fake split; choose P3 winner](8ccd8900-01cd-4ea2-97f9-c67f1b344121)
