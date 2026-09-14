import { assert, assertEquals } from "@std/assert";
import { resolveDataRoot } from "../os/mod.ts";
import { createProjectSession } from "../project-session.ts";

Deno.test("project session start / stop / fail", async () => {
	const DATA = resolveDataRoot();
	await Deno.mkdir(DATA, { recursive: true });

	const previewUrls: string[] = [];
	const session = createProjectSession({
		dataRoot: DATA,
		onPreviewUrl: (url) => previewUrls.push(url),
	});

	assertEquals(typeof session.warm, "function");

	const idle = session.snapshot();
	assertEquals(idle.phase, "idle");
	assert(idle.canStart);
	assert(!idle.canStop);

	session.start("not-a-github-url", "");
	await new Promise((r) => setTimeout(r, 50));
	const stopped = session.stop();
	assert(stopped.phase === "stopped" || stopped.phase === "failed");
	assert(!stopped.canStop);

	const reset = session.reset();
	assertEquals(reset.phase, "idle");
	assert(reset.canStart);

	session.start("not-a-github-url", "");
	for (let i = 0; i < 40; i++) {
		await new Promise((r) => setTimeout(r, 50));
		const snap = session.snapshot();
		if (snap.phase === "failed") {
			assert(snap.error);
			assert(snap.canStart);
			return;
		}
		if (snap.phase === "stopped") break;
	}

	throw new Error(`timed out waiting for failed phase: ${JSON.stringify(session.snapshot())}`);
});
