import { resolveDataRoot } from "../os/mod.ts";
import {
	createProjectSession,
	type Phase,
	type ProjectSessionSnapshot,
} from "../project-session.ts";

const DEMO =
	"https://github.com/withastro/astro/tree/main/examples/blog";

/** Past successful `bun install` — Guest→preview may still be slow/flaky. */
const PAST_INSTALL: ReadonlySet<Phase> = new Set([
	"starting",
	"waiting_for_url",
	"previewing",
]);

/** Resolve Bun + clone Astro monorepo + install can take several minutes. */
const TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 500;

function dumpSnapshot(snap: ProjectSessionSnapshot): string {
	return JSON.stringify(
		{
			phase: snap.phase,
			repoUrl: snap.repoUrl,
			workDir: snap.workDir,
			devCommand: snap.devCommand,
			previewUrl: snap.previewUrl,
			error: snap.error,
			lastChanged: snap.lastChanged,
			logTail: snap.logTail,
		},
		null,
		2,
	);
}

const dataRoot = resolveDataRoot();
await Deno.mkdir(dataRoot, { recursive: true });

const previewUrls: string[] = [];
const session = createProjectSession({
	dataRoot,
	onPreviewUrl: (url) => previewUrls.push(url),
});

try {
	session.start(DEMO, "");
	const deadline = Date.now() + TIMEOUT_MS;

	while (Date.now() < deadline) {
		const snap = session.snapshot();
		if (snap.phase === "failed") {
			console.error(
				`FAIL: pipeline failed before past-install: ${dumpSnapshot(snap)}`,
			);
			Deno.exit(1);
		}
		if (PAST_INSTALL.has(snap.phase)) {
			if (snap.workDir.length === 0) {
				console.error(
					`FAIL: expected workDir once past install: ${dumpSnapshot(snap)}`,
				);
				Deno.exit(1);
			}
			console.log("OK smoke-pipeline", {
				phase: snap.phase,
				workDir: snap.workDir,
				devCommand: snap.devCommand,
				previewUrl: snap.previewUrl,
				previewUrls,
			});
			Deno.exit(0);
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}

	console.error(
		`FAIL: timed out after ${TIMEOUT_MS}ms waiting for past-install phases ` +
			`(${[...PAST_INSTALL].join(" | ")}): ${dumpSnapshot(session.snapshot())}`,
	);
	Deno.exit(1);
} finally {
	session.stop();
}
