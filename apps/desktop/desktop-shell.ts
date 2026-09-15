import { createProjectSession } from "./project-session.ts";
import { bindControlWindow, controlPageHtml } from "./control-window.ts";
import {
	createWaitingPreview,
	type DesktopWindow,
	type DesktopWindowCtor,
	openPreview,
} from "./preview-window.ts";

export type StartDesktopShellOptions = {
	BrowserWindow: DesktopWindowCtor;
	dataRoot: string;
	defaultRepo: string;
};

export async function startDesktopShell(
	opts: StartDesktopShellOptions,
): Promise<void> {
	const { BrowserWindow, dataRoot, defaultRepo } = opts;

	await Deno.mkdir(dataRoot, { recursive: true });
	console.log(`data root: ${dataRoot}`);

	let previewWin!: DesktopWindow;
	const showPreview = (url: string) => openPreview(previewWin, url);

	const session = createProjectSession({
		dataRoot,
		onPreviewUrl: showPreview,
	});

	try {
		const engine = await session.warm({
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
		reopenPreview: showPreview,
	});

	Deno.serve(async (req) => {
		const url = new URL(req.url);
		if (url.pathname === "/" || url.pathname === "/index.html") {
			return new Response(controlPageHtml(defaultRepo), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}
		if (url.pathname === "/api/state") {
			return Response.json(session.snapshot());
		}
		return new Response("Not found", { status: 404 });
	});

	console.log("Devshell ready — Deno Desktop + Bun sidecar (control + preview).");
}
