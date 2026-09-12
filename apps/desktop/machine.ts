export type Phase =
	| "idle"
	| "cloning"
	| "detecting"
	| "installing"
	| "starting"
	| "waiting_for_url"
	| "previewing"
	| "failed"
	| "stopped";

// Lockfile PM is informational — install/run always use Bun.
export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "deno";

export type BunEngineSource = "embedded" | "path-which";

export type BunEngineInfo = {
	path: string;
	source: BunEngineSource;
	systemNodePresent: boolean;
};

export type CachedRepo = {
	id: string;
	cloneUrl: string;
	branch: string;
	localPath: string;
	lastSyncedAt: string;
	lastError?: string;
};

export type SessionState = {
	phase: Phase;
	repoUrl: string;
	subdirectory: string;
	workDir: string;
	packageManager: PackageManager | null;
	bunEngine: BunEngineInfo | null;
	devCommand: string | null;
	previewUrl: string | null;
	cachedRepos: CachedRepo[];
	lastChanged: string | null;
	logTail: string[];
	error: string | null;
};

export type Action =
	| { type: "reset" }
	| { type: "start"; repoUrl: string; subdirectory?: string }
	| { type: "phase"; phase: Phase }
	| {
			type: "detected";
			packageManager: PackageManager;
			workDir: string;
			devCommand: string;
			bunEngine: BunEngineInfo;
	  }
	| { type: "cached_repos"; repos: CachedRepo[] }
	| { type: "preview_url"; url: string }
	| { type: "log"; line: string }
	| { type: "fail"; error: string }
	| { type: "stop" };

const MAX_LOG = 40;

export function initialState(): SessionState {
	return {
		phase: "idle",
		repoUrl: "",
		subdirectory: "",
		workDir: "",
		packageManager: null,
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

export function reduce(state: SessionState, action: Action): SessionState {
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
					phase: "cloning",
					repoUrl: action.repoUrl.trim(),
					subdirectory: (action.subdirectory ?? "").trim(),
					cachedRepos: state.cachedRepos,
				},
				["phase", "repoUrl", "subdirectory"],
			);

		case "phase":
			return touch({ ...state, phase: action.phase, error: null }, ["phase"]);

		case "detected":
			return touch(
				{
					...state,
					phase: "installing",
					packageManager: action.packageManager,
					workDir: action.workDir,
					devCommand: action.devCommand,
					bunEngine: action.bunEngine,
					error: null,
				},
				[
					"phase",
					"packageManager",
					"workDir",
					"devCommand",
					"bunEngine",
				],
			);

		case "cached_repos":
			return touch({ ...state, cachedRepos: action.repos }, ["cachedRepos"]);

		case "preview_url":
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

export function canStart(state: SessionState): boolean {
	return (
		state.phase === "idle" ||
		state.phase === "failed" ||
		state.phase === "stopped" ||
		state.phase === "previewing"
	);
}

export function canStop(state: SessionState): boolean {
	return (
		state.phase !== "idle" &&
		state.phase !== "stopped" &&
		state.phase !== "failed"
	);
}
