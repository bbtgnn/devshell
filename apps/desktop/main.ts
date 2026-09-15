import { resolveDataRoot } from "./os/mod.ts";
import { startDesktopShell } from "./desktop-shell.ts";
import type { DesktopWindowCtor } from "./preview-window.ts";

const BrowserWindow = (Deno as unknown as { BrowserWindow?: DesktopWindowCtor })
	.BrowserWindow;

if (!BrowserWindow) {
	console.error(
		"Deno.BrowserWindow is missing. From apps/desktop run:\n  deno task desktop",
	);
	Deno.exit(1);
}

await startDesktopShell({
	BrowserWindow,
	dataRoot: resolveDataRoot(),
	defaultRepo:
		"https://github.com/withastro/astro/tree/main/examples/blog",
});
