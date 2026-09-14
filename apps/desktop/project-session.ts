import { existsSync } from "@std/fs";
import { join } from "@std/path";
import type { BunEngineInfo } from "./bun-engine.ts";
import { ensureBunEngine } from "./bun-engine.ts";
import {
	canStart,
	canStop,
	initialState,
	reduce,
	type Action,
	type SessionState,
} from "./machine.ts";
import {
	runCaptured,
	spawnLiving,
	type LivingProcess,
} from "./os/mod.ts";
import { listCachedRepos, syncProject } from "./project-sync.ts";

export type { SessionState };

export type ProjectSessionSnapshot = SessionState & {
	canStart: boolean;
	canStop: boolean;
};

export type ProjectSessionOptions = {
	dataRoot: string;
	onPreviewUrl?: (url: string) => void;
};

export type ProjectSession = {
	start: (repoUrl: string, subdirectory?: string) => ProjectSessionSnapshot;
	stop: () => ProjectSessionSnapshot;
	reset: () => ProjectSessionSnapshot;
	snapshot: () => ProjectSessionSnapshot;
};

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
	const { dataRoot, onPreviewUrl } = opts;

	let state: SessionState = {
		...initialState(),
		cachedRepos: listCachedRepos(dataRoot),
	};
	let living: LivingProcess | null = null;
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

	async function stopLiving() {
		const current = living;
		living = null;
		if (current) await current.stop();
	}

	async function runPipeline(token: number) {
		await stopLiving();
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

			const install = await runCaptured(installCmd, {
				cwd: dir,
				onLine: (line) => {
					if (token !== runToken) return;
					dispatch({ type: "log", line });
				},
			});
			if (token !== runToken) return;
			if (!install.success) {
				throw new Error(
					install.stderr || install.stdout || "bun install failed",
				);
			}

			dispatch({ type: "phase", phase: "starting" });
			dispatch({ type: "log", line: `spawn ${devCmd.join(" ")}` });
			dispatch({ type: "phase", phase: "waiting_for_url" });

			let found: string | null = null;
			living = spawnLiving(devCmd, {
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
			});

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
			await stopLiving();
			dispatch({
				type: "fail",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return {
		start(repoUrl: string, subdirectory = "") {
			const token = ++runToken;
			const snap = dispatch({ type: "start", repoUrl, subdirectory });
			void runPipeline(token);
			return snap;
		},
		stop() {
			runToken++;
			void stopLiving();
			return dispatch({ type: "stop" });
		},
		reset() {
			runToken++;
			void stopLiving();
			return dispatch({ type: "reset" });
		},
		snapshot,
	};
}
