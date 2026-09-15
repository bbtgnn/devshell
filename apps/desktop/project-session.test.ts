import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import type { BunEngineInfo } from "./bun-engine.ts";
import type {
	ExitStatus,
	HostedProc,
	ProcessHost,
} from "./os/mod.ts";
import {
	createProjectSession,
	type Phase,
	type ProjectSession,
} from "./project-session.ts";
import type { SyncProjectResult } from "./project-sync.ts";

const PREVIEW_URL = "http://127.0.0.1:4321/";
const FAKE_BUN = "/fake/bun";

type FakeHostOptions = {
	failInstall?: boolean;
	/** Delay before install streams close / wait resolves (ms). */
	installDelayMs?: number;
	previewUrl?: string;
};

type FakeProc = HostedProc & {
	cmd: readonly string[];
	kind: "install" | "dev" | "other";
	resolveWait: (status: ExitStatus) => void;
	waitPromise: Promise<ExitStatus>;
	stdoutCtrl: ReadableStreamDefaultController<Uint8Array> | null;
	stderrCtrl: ReadableStreamDefaultController<Uint8Array> | null;
};

function cmdKind(cmd: readonly string[]): FakeProc["kind"] {
	if (cmd.includes("install")) return "install";
	if (cmd.includes("dev") || cmd.includes("run")) return "dev";
	return "other";
}

function createFakeProcessHost(opts: FakeHostOptions = {}): ProcessHost {
	const enc = new TextEncoder();
	const procs = new Map<number, FakeProc>();
	let nextPid = 1;

	return {
		spawn(req) {
			const kind = cmdKind(req.cmd);
			let resolveWait!: (status: ExitStatus) => void;
			const waitPromise = new Promise<ExitStatus>((resolve) => {
				resolveWait = resolve;
			});
			const proc: FakeProc = {
				pid: nextPid++,
				cmd: req.cmd,
				kind,
				resolveWait,
				waitPromise,
				stdoutCtrl: null,
				stderrCtrl: null,
			};
			procs.set(proc.pid, proc);

			queueMicrotask(() => {
				const live = procs.get(proc.pid);
				if (!live) return;

				if (kind === "install") {
					const fail = opts.failInstall === true;
					const finish = () => {
						live.stderrCtrl?.enqueue(
							enc.encode(
								fail ? "bun install failed: lockfile\n" : "installed\n",
							),
						);
						live.stdoutCtrl?.close();
						live.stderrCtrl?.close();
						live.resolveWait({
							code: fail ? 1 : 0,
							success: !fail,
						});
					};
					const delay = opts.installDelayMs ?? 0;
					if (delay > 0) setTimeout(finish, delay);
					else finish();
					return;
				}

				if (kind === "dev") {
					const url = opts.previewUrl ?? PREVIEW_URL;
					live.stdoutCtrl?.enqueue(
						enc.encode(`Local:   ${url}\n`),
					);
				}
			});

			return proc;
		},
		stdout(p) {
			const proc = procs.get(p.pid)!;
			return new ReadableStream<Uint8Array>({
				start(controller) {
					proc.stdoutCtrl = controller;
				},
			});
		},
		stderr(p) {
			const proc = procs.get(p.pid)!;
			return new ReadableStream<Uint8Array>({
				start(controller) {
					proc.stderrCtrl = controller;
				},
			});
		},
		wait(p) {
			return procs.get(p.pid)!.waitPromise;
		},
		async stop(p) {
			const proc = procs.get(p.pid);
			if (!proc) return;
			try {
				proc.stdoutCtrl?.close();
			} catch {
				/* already closed */
			}
			try {
				proc.stderrCtrl?.close();
			} catch {
				/* already closed */
			}
			proc.resolveWait({ code: null, success: false });
		},
	};
}

async function makeWorkDir(): Promise<string> {
	const dir = await Deno.makeTempDir({ prefix: "devshell-session-" });
	await Deno.writeTextFile(
		join(dir, "package.json"),
		JSON.stringify({ name: "guest", scripts: { dev: "echo dev" } }),
	);
	return dir;
}

async function waitForPhase(
	session: ProjectSession,
	want: Phase | Phase[],
	timeoutMs = 2_000,
): Promise<ReturnType<ProjectSession["snapshot"]>> {
	const targets = new Set(Array.isArray(want) ? want : [want]);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const snap = session.snapshot();
		if (targets.has(snap.phase)) return snap;
		await new Promise((r) => setTimeout(r, 20));
	}
	throw new Error(
		`timed out waiting for ${[...targets].join("|")}: ${
			JSON.stringify(session.snapshot())
		}`,
	);
}

function stubEnsureBun(
	delayMs = 0,
): (dataRoot: string) => Promise<BunEngineInfo> {
	return async () => {
		if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
		return { path: FAKE_BUN };
	};
}

function stubSync(
	workDir: string,
): (
	repoUrl: string,
	subdirectory: string,
	dataRoot: string,
	onLine: (line: string) => void,
) => Promise<SyncProjectResult> {
	return async (_repoUrl, _subdirectory, _dataRoot, onLine) => {
		onLine(`sync stub → ${workDir}`);
		return {
			workDir,
			action: "cloned",
			repos: [],
		};
	};
}

Deno.test("project session happy path reaches previewing", async () => {
	const dataRoot = await Deno.makeTempDir({ prefix: "devshell-data-" });
	const workDir = await makeWorkDir();
	const previewUrls: string[] = [];

	const session = createProjectSession({
		dataRoot,
		processHost: createFakeProcessHost(),
		ensureBunEngine: stubEnsureBun(),
		syncProject: stubSync(workDir),
		onPreviewUrl: (url) => previewUrls.push(url),
	});

	assertEquals(session.snapshot().phase, "idle");
	session.start("owner/repo");

	const snap = await waitForPhase(session, "previewing");
	assertEquals(snap.previewUrl, PREVIEW_URL);
	assertEquals(previewUrls, [PREVIEW_URL]);
	assert(snap.canStop);

	const stopped = session.stop();
	assertEquals(stopped.phase, "stopped");
});

Deno.test("project session install failure → failed", async () => {
	const dataRoot = await Deno.makeTempDir({ prefix: "devshell-data-" });
	const workDir = await makeWorkDir();

	const session = createProjectSession({
		dataRoot,
		processHost: createFakeProcessHost({ failInstall: true }),
		ensureBunEngine: stubEnsureBun(),
		syncProject: stubSync(workDir),
	});

	session.start("owner/repo");
	const snap = await waitForPhase(session, "failed");
	assert(snap.error);
	assert(snap.error.includes("bun install failed") || snap.error.length > 0);
	assert(snap.canStart);
});

Deno.test("project session stop mid-flight → stopped", async () => {
	const dataRoot = await Deno.makeTempDir({ prefix: "devshell-data-" });
	const workDir = await makeWorkDir();

	const session = createProjectSession({
		dataRoot,
		processHost: createFakeProcessHost({ installDelayMs: 500 }),
		ensureBunEngine: stubEnsureBun(80),
		syncProject: stubSync(workDir),
	});

	session.start("owner/repo");
	await waitForPhase(session, ["resolving", "cloning", "installing"]);
	const stopped = session.stop();
	assertEquals(stopped.phase, "stopped");

	await new Promise((r) => setTimeout(r, 200));
	assertEquals(session.snapshot().phase, "stopped");
});

Deno.test("project session start / stop / reset surface", async () => {
	const dataRoot = await Deno.makeTempDir({ prefix: "devshell-data-" });
	const workDir = await makeWorkDir();

	const session = createProjectSession({
		dataRoot,
		processHost: createFakeProcessHost(),
		ensureBunEngine: stubEnsureBun(),
		syncProject: stubSync(workDir),
	});

	assertEquals(typeof session.warm, "function");
	const idle = session.snapshot();
	assertEquals(idle.phase, "idle");
	assert(idle.canStart);
	assert(!idle.canStop);

	session.start("owner/repo");
	await waitForPhase(session, "previewing");
	const stopped = session.stop();
	assertEquals(stopped.phase, "stopped");
	assert(!stopped.canStop);

	const reset = session.reset();
	assertEquals(reset.phase, "idle");
	assert(reset.canStart);
});
