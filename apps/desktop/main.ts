import { resolveDataRoot } from "./os/mod.ts";
import { ensureBunEngine } from "./bun-engine.ts";
import { createProjectSession } from "./project-session.ts";
import { bindControlWindow, controlPageHtml } from "./control-window.ts";

// Deno.BrowserWindow ships with `deno desktop` but isn't in stable lib types yet.
type DesktopWindow = {
	setTitle: (title: string) => void;
	navigate: (url: string) => void;
	show: () => void;
	focus: () => void;
	reload: () => void;
	bind: (name: string, handler: (...args: unknown[]) => unknown) => void;
};

type DesktopWindowCtor = new (opts?: {
	title?: string;
	width?: number;
	height?: number;
}) => DesktopWindow;

const BrowserWindow = (Deno as unknown as { BrowserWindow?: DesktopWindowCtor })
	.BrowserWindow;

const DATA_ROOT = resolveDataRoot();

const DEFAULT_REPO =
	"https://github.com/withastro/astro/tree/main/examples/blog";

let previewWin!: DesktopWindow;

function openPreview(url: string) {
	previewWin.setTitle(`Preview — ${url}`);
	previewWin.navigate(url);
	previewWin.show();
	previewWin.focus();
}

const session = createProjectSession({
	dataRoot: DATA_ROOT,
	onPreviewUrl: openPreview,
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

previewWin = new BrowserWindow({
	title: "Preview (waiting…)",
	width: 1100,
	height: 760,
});
previewWin.navigate(
	"data:text/html," +
		encodeURIComponent(`<!doctype html><meta charset=utf-8>
<title>Waiting</title>
<body style="font:16px/1.4 system-ui;padding:2rem;background:#111;color:#eee">
<h1>Preview</h1>
<p>Start the pipeline from the control window. The Project local URL will open here.</p>
</body>`),
);

bindControlWindow(controlWin, session, { reopenPreview: openPreview });

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
