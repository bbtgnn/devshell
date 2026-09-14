// Deno.BrowserWindow ships with `deno desktop` but isn't in stable lib types yet.
export type DesktopWindow = {
	setTitle: (title: string) => void;
	navigate: (url: string) => void;
	show: () => void;
	focus: () => void;
	reload: () => void;
	bind: (name: string, handler: (...args: unknown[]) => unknown) => void;
};

export type DesktopWindowCtor = new (opts?: {
	title?: string;
	width?: number;
	height?: number;
}) => DesktopWindow;

const WAITING_HTML = `<!doctype html><meta charset=utf-8>
<title>Waiting</title>
<body style="font:16px/1.4 system-ui;padding:2rem;background:#111;color:#eee">
<h1>Preview</h1>
<p>Start the pipeline from the control window. The Project local URL will open here.</p>
</body>`;

export function waitingPreviewHtml(): string {
	return WAITING_HTML;
}

export function createWaitingPreview(
	BrowserWindow: DesktopWindowCtor,
): DesktopWindow {
	const win = new BrowserWindow({
		title: "Preview (waiting…)",
		width: 1100,
		height: 760,
	});
	win.navigate(
		"data:text/html," + encodeURIComponent(waitingPreviewHtml()),
	);
	return win;
}

export function openPreview(win: DesktopWindow, url: string): void {
	win.setTitle(`Preview — ${url}`);
	win.navigate(url);
	win.show();
	win.focus();
}
