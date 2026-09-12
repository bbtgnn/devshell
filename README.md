# Devshell

**Devshell** syncs a GitHub repo, installs and runs `dev` with a Bun sidecar, and opens native preview window(s) on the detected local URL.

Stack (see [ADR 0001](docs/adr/0001-deno-desktop-shell-bun-sidecar.md)): **Deno Desktop** shell + **Bun** sidecar + **isomorphic-git** (no system git required for sync).

## Requirements

- **Deno ≥ 2.9** (`deno desktop`)
- **Bun** on `PATH`, or vendor one: `bash apps/desktop/scripts/vendor-bun.sh`

## Layout

```
apps/desktop/          # Deno Desktop control + preview
packages/client/       # @devshell/client stub (later)
docs/adr/
research/
```

Flavors (branded single-repo builds) are paused.

## Run

From repo root:

```bash
deno task desktop
```

Or from `apps/desktop`:

```bash
deno task desktop
```

Default demo target: [Astro blog example](https://github.com/withastro/astro/tree/main/examples/blog).

### Headless smokes

```bash
deno task smoke:resolve
deno task smoke:pipeline
```

Clone/work cache lives under the OS app-data dir (macOS: `~/Library/Application Support/Devshell/`). Override with `DEVSHELL_DATA_DIR`.

Embedded Bun override: `DEVSHELL_BUN_PATH=/path/to/bun`.

## Domain language

See [CONTEXT.md](CONTEXT.md). Initialization brief from the CMS monorepo spike: [HANDOFF.md](HANDOFF.md).
