# Deno Desktop shell + Bun sidecar

Devshell needs a desktop shell that syncs a GitHub-backed Project, installs and runs `dev`, and opens controllable preview windows — portable enough that the client need not install Node, npm, or system git.

**Status:** accepted

## Decision

- **Shell:** Deno Desktop (control + preview windows). Not Electrobun, Electron, or CEF-as-product. The product needs a preview window for pages, not an embedded browser.
- **Toolchain:** a real Bun CLI executable as sidecar (`embedded` or `path-which`). Never treat a directory named `bun` as the CLI.
- **Sync:** isomorphic-git into a durable Data root (clone cache + registry); materialize Work roots for monorepo subdirectories. No system git required for sync.
- **Preview:** a second OS window driven by navigate / reload / show / focus. Approximate split with window geometry; no native split pane. Do not rebuild mini-browser chrome (URL bar, back/forward, same-origin proxy) — tried and rejected once the product need was clear.

## Considered options

1. **Deno Desktop alone** — shell worked, but install/run still leaned on the host Node / package-manager story for real projects.
2. **Electrobun + embedded Bun** — aimed at single-binary portability; shell packaging was harder (including resolving a directory named `bun` with EACCES) while Deno stayed simpler.
3. **Deno Desktop + Bun sidecar** (chosen) — Deno windows + real Bun executable + isomorphic-git cache.

## Consequences

- Portability is “Deno-packaged app + vendored Bun (+ isomorphic-git),” not an Electrobun host. Packaging / notarization still open.
- Preview UX is app-driven URL navigation, not synced browsing chrome.
