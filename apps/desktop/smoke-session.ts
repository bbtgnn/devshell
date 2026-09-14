import { resolveDataRoot } from "./os/mod.ts";
import { createProjectSession } from "./project-session.ts";

const DATA = resolveDataRoot();
await Deno.mkdir(DATA, { recursive: true });

const previewUrls: string[] = [];
const session = createProjectSession({
	dataRoot: DATA,
	onPreviewUrl: (url) => previewUrls.push(url),
});

const idle = session.snapshot();
if (idle.phase !== "idle" || !idle.canStart || idle.canStop) {
	console.error("expected idle startable snapshot", idle);
	Deno.exit(1);
}

session.start("not-a-github-url", "");
await new Promise((r) => setTimeout(r, 50));
const stopped = session.stop();
if (stopped.phase !== "stopped" && stopped.phase !== "failed") {
	console.error("expected stop or fail after cancel", stopped);
	Deno.exit(1);
}
if (stopped.canStop) {
	console.error("canStop should be false after stop", stopped);
	Deno.exit(1);
}

const reset = session.reset();
if (reset.phase !== "idle" || !reset.canStart) {
	console.error("expected idle after reset", reset);
	Deno.exit(1);
}

session.start("not-a-github-url", "");
for (let i = 0; i < 40; i++) {
	await new Promise((r) => setTimeout(r, 50));
	const snap = session.snapshot();
	if (snap.phase === "failed") {
		if (!snap.error) {
			console.error("failed without error", snap);
			Deno.exit(1);
		}
		console.log("SMOKE SESSION OK", {
			failError: snap.error,
			previewUrls,
			canStart: snap.canStart,
		});
		Deno.exit(0);
	}
	if (snap.phase === "stopped") break;
}

console.error("timed out waiting for failed phase", session.snapshot());
Deno.exit(1);
