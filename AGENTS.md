# AGENTS.md

Devshell syncs a GitHub-backed **Project**, runs install/`dev` via a **Bun engine**, and opens native **preview** windows from a Deno Desktop **control** UI.

## Working rules

### Opaque comments

A comment earns its place only when the next reader would otherwise misread intent the code cannot express. Default: no comment.

### Conventional titles

Commits, issues, and PR titles use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` — e.g. `feat(desktop): …`, `fix(runner): …`, `docs(adr): …`, `chore: …`.

## Reach when

- **Domain** (naming Project, Work root, Data root, Bun engine, Guest app, Client package, Flavor, …): read [CONTEXT.md](CONTEXT.md). Resolve or change a term → update it there.
- **Architecture** (Deno Desktop shell, Bun sidecar, isomorphic-git sync, preview `BrowserWindow`, rejecting Electrobun/browser chrome): read [docs/adr/](docs/adr/), start with [0001](docs/adr/0001-deno-desktop-shell-bun-sidecar.md). Record a hard-to-reverse trade-off → add an ADR.
- **Run / smoke / data-dir overrides**: [README.md](README.md); tasks and desktop config live in the repo’s `deno.json` files.
- **Handoff** (spike port, CMS monorepo boundary, what not to absorb): [HANDOFF.md](HANDOFF.md).
