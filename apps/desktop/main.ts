import { resolveDataRoot } from "./os/mod.ts";
import { ensureBunEngine } from "./bun-engine.ts";
import { createProjectSession } from "./project-session.ts";
import { bindControlWindow, controlPageHtml } from "./control-window.ts";
import {
	createWaitingPreview,
	type DesktopWindow,
	type DesktopWindowCtor,
	openPreview,
} from "./preview-window.ts";

const BrowserWindow = (Deno as unknown as { BrowserWindow?: DesktopWindowCtor })
	.BrowserWindow;

const DATA_ROOT = resolveDataRoot();

const DEFAULT_REPO =
	"https://github.com/withastro/astro/tree/main/examples/blog";

let previewWin!: DesktopWindow;

const session = createProjectSession({
	dataRoot: DATA_ROOT,
	onPreviewUrl: (url) => openPreview(previewWin, url),
});

if (!BrowserWindow) {
	console.error(
		"Deno.BrowserWindow is missing. From apps/desktop run:\n  deno task desktop",
	);
	Deno.exit(1);
}

await Deno.mkdir(DATA_ROOT, { recursive: true });
console.log(`data root: ${DATA_ROOT}`);

try {
	const engine = await ensureBunEngine(DATA_ROOT, {
		onProgress: (line) => console.log(line),
	});
	console.log(`bunEngine at boot: ${engine.path}`);
} catch (err) {
	console.warn(
		"bunEngine ensure failed at boot:",
		err instanceof Error ? err.message : err,
	);
}

const controlWin = new BrowserWindow({
	title: "Devshell (control)",
	width: 920,
	height: 860,
});

previewWin = createWaitingPreview(BrowserWindow);

bindControlWindow(controlWin, session, {
	reopenPreview: (url) => openPreview(previewWin, url),
});

Deno.serve(async (req) => {
	const url = new URL(req.url);
	if (url.pathname === "/" || url.pathname === "/index.html") {
		return new Response(controlPageHtml(DEFAULT_REPO), {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	}
	if (url.pathname === "/api/state") {
		return Response.json(session.snapshot());
	}
	return new Response("Not found", { status: 404 });
});

console.log("Devshell ready — Deno Desktop + Bun sidecar (control + preview).");
