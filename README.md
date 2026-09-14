# Devshell

**Devshell** syncs a GitHub repo, installs and runs `dev` with a Bun sidecar, and opens native preview window(s) on the detected local URL.

Stack (see [ADR 0001](docs/adr/0001-deno-desktop-shell-bun-sidecar.md)): **Deno Desktop** shell + **Bun** sidecar + **isomorphic-git** (no system git required for sync).

## Requirements

- **Deno ≥ 2.9** (`deno desktop`)
- **Bun** on `PATH`, or vendor one:
  - macOS / Linux: `bash apps/desktop/scripts/vendor-bun.sh`
  - Windows: `powershell -File apps/desktop/scripts/vendor-bun.ps1`

## Layout

```
apps/desktop/          # Deno Desktop control + preview
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

```bash
deno task smoke:resolve
deno task smoke:pipeline
```

Clone/work cache lives under the OS app-data dir:

- macOS: `~/Library/Application Support/Devshell/`
- Windows: `%LOCALAPPDATA%\Devshell\`
- Linux: `$XDG_DATA_HOME/devshell` or `~/.local/share/devshell`

Override with `DEVSHELL_DATA_DIR`. Targets are **desktop only** (no iOS/Android) — see [CONTEXT.md](CONTEXT.md).

Embedded Bun override: `DEVSHELL_BUN_PATH=/path/to/bun`.

## Domain language

See [CONTEXT.md](CONTEXT.md). Phases and deferred work: [docs/roadmap.md](docs/roadmap.md).
