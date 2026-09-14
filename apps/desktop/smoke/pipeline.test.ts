import { assert } from "@std/assert";
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

Deno.test({
	name: "pipeline via Project session reaches past install",
	sanitizeResources: false,
	sanitizeOps: false,
	async fn() {
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
					throw new Error(
						`pipeline failed before past-install: ${dumpSnapshot(snap)}`,
					);
				}
				if (PAST_INSTALL.has(snap.phase)) {
					assert(
						snap.workDir.length > 0,
						`expected workDir once past install: ${dumpSnapshot(snap)}`,
					);
					console.log("SMOKE PIPELINE OK", {
						phase: snap.phase,
						workDir: snap.workDir,
						devCommand: snap.devCommand,
						previewUrl: snap.previewUrl,
						previewUrls,
					});
					return;
				}
				await new Promise((r) => setTimeout(r, POLL_MS));
			}

			throw new Error(
				`timed out after ${TIMEOUT_MS}ms waiting for past-install phases ` +
					`(${[...PAST_INSTALL].join(" | ")}): ${dumpSnapshot(session.snapshot())}`,
			);
		} finally {
			session.stop();
		}
	},
});
