import { existsSync } from "@std/fs";
import { join } from "@std/path";
import type { BunEngineInfo, EnsureBunEngineOptions } from "./bun-engine.ts";
import { ensureBunEngine as defaultEnsureBunEngine } from "./bun-engine.ts";
import {
	defaultProcessHost,
	runCaptured,
	spawnLiving,
	type CapturedRun,
	type LivingProcess,
	type ProcessHost,
} from "./os/mod.ts";
import {
	listCachedRepos,
	syncProject as defaultSyncProject,
	type CachedRepo,
	type SyncProjectResult,
} from "./project-sync.ts";

export type Phase =
	| "idle"
	| "resolving"
	| "cloning"
	| "installing"
	| "starting"
	| "waiting_for_url"
	| "previewing"
	| "failed"
	| "stopped";

export type SessionState = {
	phase: Phase;
	repoUrl: string;
	subdirectory: string;
	workDir: string;
	bunEngine: BunEngineInfo | null;
	devCommand: string | null;
	previewUrl: string | null;
	cachedRepos: CachedRepo[];
	lastChanged: string | null;
	logTail: string[];
	error: string | null;
};

export type ProjectSessionSnapshot = SessionState & {
	canStart: boolean;
	canStop: boolean;
};

export type ProjectSessionOptions = {
	dataRoot: string;
	onPreviewUrl?: (url: string) => void;
	processHost?: ProcessHost;
	ensureBunEngine?: (
		dataRoot: string,
		opts?: EnsureBunEngineOptions,
	) => Promise<BunEngineInfo>;
	syncProject?: (
		repoUrl: string,
		subdirectory: string,
		dataRoot: string,
		onLine: (line: string) => void,
	) => Promise<SyncProjectResult>;
};

export type WarmOptions = {
	onProgress?: (line: string) => void;
};

export type ProjectSession = {
	warm: (opts?: WarmOptions) => Promise<BunEngineInfo>;
	start: (repoUrl: string, subdirectory?: string) => ProjectSessionSnapshot;
	stop: () => ProjectSessionSnapshot;
	reset: () => ProjectSessionSnapshot;
	snapshot: () => ProjectSessionSnapshot;
};

type Action =
	| { type: "reset" }
	| { type: "start"; repoUrl: string; subdirectory?: string }
	| { type: "cloning" }
	| {
			type: "ready";
			workDir: string;
			devCommand: string;
			bunEngine: BunEngineInfo;
	  }
	| { type: "starting" }
	| { type: "waiting_for_url" }
	| { type: "cached_repos"; repos: CachedRepo[] }
	| { type: "preview_url"; url: string }
	| { type: "log"; line: string }
	| { type: "fail"; error: string }
	| { type: "stop" };

const MAX_LOG = 40;

const STARTABLE: ReadonlySet<Phase> = new Set([
	"idle",
	"failed",
	"stopped",
	"previewing",
]);

function initialState(): SessionState {
	return {
		phase: "idle",
		repoUrl: "",
		subdirectory: "",
		workDir: "",
		bunEngine: null,
		devCommand: null,
		previewUrl: null,
		cachedRepos: [],
		lastChanged: null,
		logTail: [],
		error: null,
	};
}

function touch(state: SessionState, fields: string[]): SessionState {
	return { ...state, lastChanged: fields.join(", ") };
}

function canStart(state: SessionState): boolean {
	return STARTABLE.has(state.phase);
}

function canStop(state: SessionState): boolean {
	return (
		state.phase !== "idle" &&
		state.phase !== "stopped" &&
		state.phase !== "failed"
	);
}

function reduce(state: SessionState, action: Action): SessionState {
	switch (action.type) {
		case "reset":
			return touch(
				{ ...initialState(), cachedRepos: state.cachedRepos },
				["phase", "repoUrl", "error", "previewUrl"],
			);

		case "start":
			return touch(
				{
					...initialState(),
					phase: "resolving",
					repoUrl: action.repoUrl.trim(),
					subdirectory: (action.subdirectory ?? "").trim(),
					cachedRepos: state.cachedRepos,
				},
				["phase", "repoUrl", "subdirectory"],
			);

		case "cloning":
			if (state.phase !== "resolving") return state;
			return touch({ ...state, phase: "cloning", error: null }, ["phase"]);

		case "ready":
			if (state.phase !== "cloning") return state;
			return touch(
				{
					...state,
					phase: "installing",
					workDir: action.workDir,
					devCommand: action.devCommand,
					bunEngine: action.bunEngine,
					error: null,
				},
				["phase", "workDir", "devCommand", "bunEngine"],
			);

		case "starting":
			if (state.phase !== "installing") return state;
			return touch({ ...state, phase: "starting", error: null }, ["phase"]);

		case "waiting_for_url":
			if (state.phase !== "starting") return state;
			return touch(
				{ ...state, phase: "waiting_for_url", error: null },
				["phase"],
			);

		case "cached_repos":
			return touch({ ...state, cachedRepos: action.repos }, ["cachedRepos"]);

		case "preview_url":
			if (
				state.phase !== "waiting_for_url" &&
				state.phase !== "starting"
			) {
				return state;
			}
			return touch(
				{
					...state,
					phase: "previewing",
					previewUrl: action.url,
					error: null,
				},
				["phase", "previewUrl"],
			);

		case "log": {
			const logTail = [...state.logTail, action.line].slice(-MAX_LOG);
			return touch({ ...state, logTail }, ["logTail"]);
		}

		case "fail":
			return touch(
				{ ...state, phase: "failed", error: action.error },
				["phase", "error"],
			);

		case "stop":
			return touch(
				{
					...state,
					phase: state.phase === "idle" ? "idle" : "stopped",
					error: null,
				},
				["phase"],
			);

		default:
			return state;
	}
}

function bunInstallCommand(engine: BunEngineInfo): string[] {
	return [engine.path, "install"];
}

function bunDevCommand(engine: BunEngineInfo, dir: string): string[] {
	const pkgPath = join(dir, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error(`No package.json in ${dir}`);
	}
	const pkg = JSON.parse(Deno.readTextFileSync(pkgPath)) as {
		scripts?: Record<string, string>;
	};
	if (!pkg.scripts?.dev) {
		throw new Error(`No "dev" script found in ${dir}`);
	}
	return [engine.path, "run", "dev"];
}

function extractLocalUrl(chunk: string): string | null {
	const match = chunk.match(
		/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s"'<>]*/i,
	);
	if (!match) return null;
	return match[0]
		.replace("0.0.0.0", "127.0.0.1")
		.replace(/[),.;]+$/, "");
}

export function createProjectSession(
	opts: ProjectSessionOptions,
): ProjectSession {
	const {
		dataRoot,
		onPreviewUrl,
		processHost = defaultProcessHost(),
		ensureBunEngine = defaultEnsureBunEngine,
		syncProject = defaultSyncProject,
	} = opts;

	let state: SessionState = {
		...initialState(),
		cachedRepos: listCachedRepos(dataRoot),
	};
	let living: LivingProcess | null = null;
	let captured: CapturedRun | null = null;
	let runToken = 0;

	function snapshot(): ProjectSessionSnapshot {
		return {
			...state,
			canStart: canStart(state),
			canStop: canStop(state),
		};
	}

	function dispatch(action: Action): ProjectSessionSnapshot {
		state = reduce(state, action);
		console.log(`[state] ${state.phase}`, {
			repoUrl: state.repoUrl,
			bunEngine: state.bunEngine,
			previewUrl: state.previewUrl,
			error: state.error,
			lastChanged: state.lastChanged,
		});
		return snapshot();
	}

	async function stopGuestProcesses() {
		const currentCaptured = captured;
		captured = null;
		const currentLiving = living;
		living = null;
		await Promise.all([
			currentCaptured ? currentCaptured.stop() : Promise.resolve(),
			currentLiving ? currentLiving.stop() : Promise.resolve(),
		]);
	}

	async function runPipeline(token: number) {
		await stopGuestProcesses();
		if (token !== runToken) return;

		try {
			const engine = await ensureBunEngine(dataRoot, {
				onProgress: (line) => {
					if (token !== runToken) return;
					dispatch({ type: "log", line });
				},
			});
			if (token !== runToken) return;
			dispatch({
				type: "log",
				line: `bunEngine ${engine.path}`,
			});
			dispatch({ type: "cloning" });

			const synced = await syncProject(
				state.repoUrl,
				state.subdirectory,
				dataRoot,
				(line) => {
					if (token !== runToken) return;
					dispatch({ type: "log", line });
				},
			);
			if (token !== runToken) return;
			dispatch({ type: "cached_repos", repos: synced.repos });
			dispatch({
				type: "log",
				line:
					synced.action === "pulled"
						? `cache hit → pull (${synced.workDir})`
						: `fresh clone (${synced.workDir})`,
			});

			const dir = synced.workDir;
			const installCmd = bunInstallCommand(engine);
			const devCmd = bunDevCommand(engine, dir);
			dispatch({
				type: "ready",
				workDir: dir,
				devCommand: devCmd.join(" "),
				bunEngine: engine,
			});

			captured = runCaptured(
				installCmd,
				{
					cwd: dir,
					onLine: (line) => {
						if (token !== runToken) return;
						dispatch({ type: "log", line });
					},
				},
				processHost,
			);
			const install = await captured.result;
			captured = null;
			if (token !== runToken) return;
			if (!install.success) {
				throw new Error(
					install.stderr || install.stdout || "bun install failed",
				);
			}

			dispatch({ type: "starting" });
			dispatch({ type: "log", line: `spawn ${devCmd.join(" ")}` });
			dispatch({ type: "waiting_for_url" });

			let found: string | null = null;
			living = spawnLiving(
				devCmd,
				{
					cwd: dir,
					onChunk: (text) => {
						if (token !== runToken) return;
						for (const line of text.split(/\r?\n/)) {
							if (line.trim()) dispatch({ type: "log", line });
						}
						const url = extractLocalUrl(text);
						if (url && !found) {
							found = url;
							dispatch({ type: "preview_url", url });
							onPreviewUrl?.(url);
						}
					},
				},
				processHost,
			);

			void living.exited.then((status) => {
				if (token !== runToken) return;
				if (status.stopped) return;
				if (
					state.phase === "previewing" ||
					state.phase === "waiting_for_url"
				) {
					dispatch({
						type: "fail",
						error: `dev process exited (${status.code})`,
					});
				}
			});
		} catch (err) {
			if (token !== runToken) return;
			await stopGuestProcesses();
			dispatch({
				type: "fail",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return {
		warm(opts?: WarmOptions) {
			return ensureBunEngine(dataRoot, {
				onProgress: opts?.onProgress,
			});
		},
		start(repoUrl: string, subdirectory = "") {
			const token = ++runToken;
			const snap = dispatch({ type: "start", repoUrl, subdirectory });
			void runPipeline(token);
			return snap;
		},
		stop() {
			runToken++;
			void stopGuestProcesses();
			return dispatch({ type: "stop" });
		},
		reset() {
			runToken++;
			void stopGuestProcesses();
			return dispatch({ type: "reset" });
		},
		snapshot,
	};
}
