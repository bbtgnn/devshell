# Devshell

**Devshell** syncs a GitHub repo, installs and runs `dev` with a Bun sidecar, and opens native preview window(s) on the detected local URL.

Stack (see [ADR 0001](docs/adr/0001-deno-desktop-shell-bun-sidecar.md)): **Deno Desktop** shell + **Bun** sidecar + **isomorphic-git** (no system git required for sync).

## Requirements

- **Deno ≥ 2.9** (`deno desktop`)
- **Bun** is optional: if none is on `PATH` / `DEVSHELL_BUN_PATH`, Devshell downloads a **pinned** build into the data root (`engine/bun-<version>/`) and reuses it on later launches.

## Layout

```
apps/desktop/          # Deno Desktop control + preview
apps/desktop/smoke/    # headless smokes (*.test.ts + network scripts)
packages/client/       # @devshell/client stub (later)
docs/adr/
research/
```

Flavors (branded single-repo builds) are not shipping yet.

## Run

From repo root:

```bash
deno task desktop
```

Or from `apps/desktop`:

```bash
deno task desktop
```

Default demo target: [Astro’s blog example](https://github.com/withastro/astro/tree/main/examples/blog) (any GitHub JS Project with a `dev` script works).

### Headless smokes

Fast checks live under `apps/desktop/smoke/*.test.ts` (`deno task test`). Network / full-pipeline scripts stay as tasks:

```bash
deno task test
deno task smoke:bun-download   # network; PATH-stripped download into a temp data dir
deno task smoke:pipeline
```

Clone/work/engine cache lives under the OS app-data dir:

- macOS: `~/Library/Application Support/Devshell/`
- Windows: `%LOCALAPPDATA%\Devshell\`
- Linux: `$XDG_DATA_HOME/devshell` or `~/.local/share/devshell`

Override with `DEVSHELL_DATA_DIR`. Targets are **desktop only** (no iOS/Android) — see [CONTEXT.md](CONTEXT.md).

Optional Bun override: `DEVSHELL_BUN_PATH=/path/to/bun`.

## Domain language

See [CONTEXT.md](CONTEXT.md). Phases and deferred work: [docs/roadmap.md](docs/roadmap.md).
