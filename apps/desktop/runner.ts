/**
 * Impure runner — isomorphic-git cache / Bun sidecar install / spawn.
 * Install/run always use a resolved Bun *executable* (never a directory named
 * bun). Clones live under the data root; re-runs pull instead of wiping.
 * No system `git` required for sync.
 */

import fs, {
	cpSync,
	existsSync,
	mkdirSync,
	rmSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type {
	BunEngineInfo,
	CachedRepo,
	PackageManager,
} from "./machine.ts";

export type ParsedGithub = {
	owner: string;
	repo: string;
	cloneUrl: string;
	subdirectory: string;
	branch: string;
};

export type BunEngine = BunEngineInfo;

/** True for a regular file that is executable (dirs can pass X_OK alone on macOS). */
export function isExecutableFile(path: string): boolean {
	try {
		const st = Deno.statSync(path);
		if (!st.isFile) return false;
		if (st.mode != null && (st.mode & 0o111) === 0) return false;
		return true;
	} catch {
		return false;
	}
}

/** PATH lookup — Deno.which is not available in all desktop builds. */
function whichOnPath(cmd: string): string | null {
	const pathEnv = Deno.env.get("PATH") ?? "";
	for (const dir of pathEnv.split(":")) {
		if (!dir) continue;
		const candidate = join(dir, cmd);
		if (isExecutableFile(candidate)) return candidate;
	}
	return null;
}

function systemNodePresent(): boolean {
	return Boolean(whichOnPath("node") || whichOnPath("npm"));
}

/**
 * Prefer a real Bun CLI binary. Never treat a JS bundle directory named `bun`
 * as the CLI (EACCES posix_spawn footgun from Electrobun spike).
 *
 * Order: DEVSHELL_BUN_PATH → vendor/bin beside app → app-bundle siblings of
 * Deno.execPath → BUN_INSTALL/bin/bun → PATH bun.
 */
export function resolveBunEngine(appRoot: string): BunEngine {
	const nodePresent = systemNodePresent();

	const envPath =
		Deno.env.get("DEVSHELL_BUN_PATH")?.trim() ||
		Deno.env.get("PROTOTYPE_BUN_PATH")?.trim();
	if (envPath) {
		if (!isExecutableFile(envPath)) {
			throw new Error(
				`DEVSHELL_BUN_PATH is not an executable file: ${envPath}`,
			);
		}
		return { path: envPath, source: "embedded", systemNodePresent: nodePresent };
	}

	const embeddedCandidates = [
		join(appRoot, "bin", "bun"),
		join(appRoot, "bin", "bun.exe"),
		join(appRoot, "vendor", "bun"),
		join(appRoot, "vendor", "bin", "bun"),
	];

	try {
		const execPath = Deno.execPath();
		const execDir = dirname(execPath);
		embeddedCandidates.push(
			join(execDir, "bun"),
			join(execDir, "bun.exe"),
			join(execDir, "bin", "bun"),
			join(execDir, "..", "Resources", "bin", "bun"),
			join(execDir, "..", "MacOS", "bun"),
		);
	} catch {
		/* Deno.execPath unavailable — skip */
	}

	for (const candidate of embeddedCandidates) {
		if (isExecutableFile(candidate)) {
			return {
				path: candidate,
				source: "embedded",
				systemNodePresent: nodePresent,
			};
		}
	}

	const bunInstall = Deno.env.get("BUN_INSTALL")?.trim();
	if (bunInstall) {
		const fromInstall = join(bunInstall, "bin", "bun");
		if (isExecutableFile(fromInstall)) {
			return {
				path: fromInstall,
				source: "path-which",
				systemNodePresent: nodePresent,
			};
		}
	}

	const which = whichOnPath("bun");
	if (which) {
		return {
			path: which,
			source: "path-which",
			systemNodePresent: nodePresent,
		};
	}

	throw new Error(
		"No Bun CLI found. Set DEVSHELL_BUN_PATH, run scripts/vendor-bun.sh, or put bun on PATH.",
	);
}

export function bunInstallCommand(engine: BunEngine): string[] {
	return [engine.path, "install"];
}

export function bunDevCommand(engine: BunEngine, dir: string): string[] {
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

export function formatBunEngine(engine: BunEngine): string {
	return `${engine.source} → ${engine.path} (systemNode=${engine.systemNodePresent})`;
}

/** Accepts owner/repo or full github.com URLs, including /tree/<branch>/<subdir>. */
export function parseGithubInput(input: string, subdirectory = ""): ParsedGithub {
	const raw = input.trim();
	let owner = "";
	let repo = "";
	let branch = "main";
	let sub = subdirectory.trim();

	const treeMatch = raw.match(
		/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?\/?$/,
	);
	const repoMatch = raw.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#]+)\/?$/);
	const shortMatch = raw.match(/^([^/\s]+)\/([^/\s]+)$/);

	if (treeMatch) {
		owner = treeMatch[1];
		repo = treeMatch[2].replace(/\.git$/, "");
		branch = treeMatch[3];
		if (!sub && treeMatch[4]) sub = treeMatch[4];
	} else if (repoMatch) {
		owner = repoMatch[1];
		repo = repoMatch[2].replace(/\.git$/, "");
	} else if (shortMatch) {
		owner = shortMatch[1];
		repo = shortMatch[2].replace(/\.git$/, "");
	} else {
		throw new Error(`Unrecognized GitHub input: ${input}`);
	}

	return {
		owner,
		repo,
		cloneUrl: `https://github.com/${owner}/${repo}.git`,
		subdirectory: sub,
		branch,
	};
}

export function repoSlug(parsed: ParsedGithub): string {
	return `${parsed.owner}__${parsed.repo}`;
}

export function registryPath(dataRoot: string): string {
	return join(dataRoot, "clones-registry.json");
}

export type CloneRegistry = { repos: CachedRepo[] };

export function loadRegistry(dataRoot: string): CloneRegistry {
	const path = registryPath(dataRoot);
	if (!existsSync(path)) return { repos: [] };
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as CloneRegistry;
		return { repos: Array.isArray(raw.repos) ? raw.repos : [] };
	} catch {
		return { repos: [] };
	}
}

export function saveRegistry(dataRoot: string, registry: CloneRegistry): void {
	mkdirSync(dataRoot, { recursive: true });
	writeFileSync(registryPath(dataRoot), `${JSON.stringify(registry, null, 2)}\n`);
}

export function listCachedRepos(dataRoot: string): CachedRepo[] {
	return loadRegistry(dataRoot).repos;
}

function upsertRegistryEntry(dataRoot: string, entry: CachedRepo): CachedRepo[] {
	const registry = loadRegistry(dataRoot);
	const i = registry.repos.findIndex((r) => r.id === entry.id);
	if (i >= 0) registry.repos[i] = entry;
	else registry.repos.push(entry);
	saveRegistry(dataRoot, registry);
	return registry.repos;
}

export type EnsureRepoResult = {
	cloneDir: string;
	action: "cloned" | "pulled";
	repos: CachedRepo[];
};

function onGitProgress(
	onLine: (line: string) => void,
	phase: string,
): (event: { phase: string; loaded: number; total: number }) => void {
	let lastPct = -1;
	return (event) => {
		if (!event.total) return;
		const pct = Math.floor((100 * event.loaded) / event.total);
		if (pct === lastPct || pct % 10 !== 0) return;
		lastPct = pct;
		onLine(`git ${phase}: ${event.phase} ${pct}%`);
	};
}

/** Durable clone under dataRoot/clones/<owner>__<repo>/ — keeps .git for pulls. */
export async function ensureRepo(
	parsed: ParsedGithub,
	dataRoot: string,
	onLine: (line: string) => void,
): Promise<EnsureRepoResult> {
	const id = repoSlug(parsed);
	const cloneDir = join(dataRoot, "clones", id);
	const gitDir = join(cloneDir, ".git");
	mkdirSync(join(dataRoot, "clones"), { recursive: true });

	let action: "cloned" | "pulled";

	try {
		if (existsSync(gitDir)) {
			action = "pulled";
			onLine(`cache hit → pull ${id} @ ${parsed.branch}`);
			await git.fetch({
				fs,
				http,
				dir: cloneDir,
				remote: "origin",
				ref: parsed.branch,
				singleBranch: true,
				depth: 1,
				onProgress: onGitProgress(onLine, "fetch"),
			});
			const remoteRef = `refs/remotes/origin/${parsed.branch}`;
			const oid = await git.resolveRef({ fs, dir: cloneDir, ref: remoteRef });
			await git.writeRef({
				fs,
				dir: cloneDir,
				ref: `refs/heads/${parsed.branch}`,
				value: oid,
				force: true,
			});
			await git.checkout({
				fs,
				dir: cloneDir,
				ref: parsed.branch,
				force: true,
			});
			onLine(`pulled ${id} → ${oid.slice(0, 7)}`);
		} else {
			action = "cloned";
			onLine(`fresh clone ${parsed.cloneUrl} @ ${parsed.branch} → ${cloneDir}`);
			rmSync(cloneDir, { recursive: true, force: true });
			await git.clone({
				fs,
				http,
				dir: cloneDir,
				url: parsed.cloneUrl,
				ref: parsed.branch,
				singleBranch: true,
				depth: 1,
				onProgress: onGitProgress(onLine, "clone"),
			});
			onLine(`cloned ${id}`);
		}

		const repos = upsertRegistryEntry(dataRoot, {
			id,
			cloneUrl: parsed.cloneUrl,
			branch: parsed.branch,
			localPath: cloneDir,
			lastSyncedAt: new Date().toISOString(),
		});
		return { cloneDir, action, repos };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (!existsSync(gitDir)) {
			rmSync(cloneDir, { recursive: true, force: true });
		}
		upsertRegistryEntry(dataRoot, {
			id,
			cloneUrl: parsed.cloneUrl,
			branch: parsed.branch,
			localPath: cloneDir,
			lastSyncedAt: new Date().toISOString(),
			lastError: message,
		});
		throw err;
	}
}

/**
 * Subdirectory monorepo packages are copied into dataRoot/work/… so Vite/tsc
 * do not walk up into monorepo root configs. Non-subdir repos use the clone.
 */
export function materializeWorkDir(
	cloneDir: string,
	subdirectory: string,
	dataRoot: string,
	onLine: (line: string) => void,
): string {
	const sub = subdirectory.trim();
	if (!sub) return cloneDir;

	const src = join(cloneDir, sub);
	if (!existsSync(src)) {
		throw new Error(`Subdirectory not found in clone: ${sub}`);
	}

	const cloneId = cloneDir.split(/[/\\]/).pop() ?? "repo";
	const subSlug = sub.replace(/[/\\]+/g, "__");
	const workDir = join(dataRoot, "work", `${cloneId}__${subSlug}`);
	onLine(`materialize ${sub} → ${workDir}`);
	rmSync(workDir, { recursive: true, force: true });
	mkdirSync(dirname(workDir), { recursive: true });
	cpSync(src, workDir, { recursive: true });
	return workDir;
}

/** Informational only — install/run always use resolved Bun. */
export function detectPackageManager(dir: string): PackageManager {
	if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) {
		return "bun";
	}
	if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(dir, "yarn.lock"))) return "yarn";
	if (existsSync(join(dir, "package-lock.json"))) return "npm";
	if (existsSync(join(dir, "deno.json")) || existsSync(join(dir, "deno.jsonc"))) {
		return "deno";
	}
	if (existsSync(join(dir, "package.json"))) return "npm";
	throw new Error(`No package manager clues in ${dir}`);
}

export function extractLocalUrl(chunk: string): string | null {
	const match = chunk.match(
		/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s"'<>]*/i,
	);
	if (!match) return null;
	return match[0]
		.replace("0.0.0.0", "127.0.0.1")
		.replace(/[),.;]+$/, "");
}

export type RunResult = {
	success: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
};

export async function runCaptured(
	cmd: string[],
	opts: { cwd: string; onLine?: (line: string, stream: "out" | "err") => void },
): Promise<RunResult> {
	const proc = new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		cwd: opts.cwd,
		stdout: "piped",
		stderr: "piped",
	}).spawn();

	let stdout = "";
	let stderr = "";

	const read = async (
		stream: ReadableStream<Uint8Array>,
		kind: "out" | "err",
	) => {
		const reader = stream.getReader();
		const dec = new TextDecoder();
		let buf = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const text = dec.decode(value, { stream: true });
			if (kind === "out") stdout += text;
			else stderr += text;
			buf += text;
			const parts = buf.split(/\r?\n/);
			buf = parts.pop() ?? "";
			for (const line of parts) {
				if (line.trim()) opts.onLine?.(line, kind);
			}
		}
		if (buf.trim()) opts.onLine?.(buf, kind);
	};

	await Promise.all([read(proc.stdout, "out"), read(proc.stderr, "err")]);
	const status = await proc.status;
	return {
		success: status.success,
		code: status.code,
		stdout,
		stderr,
	};
}

export type LivingProcess = {
	kill: () => void;
	wait: Promise<Deno.CommandStatus>;
};

export function spawnLiving(
	cmd: string[],
	opts: {
		cwd: string;
		onChunk: (text: string) => void;
	},
): LivingProcess {
	const proc = new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		cwd: opts.cwd,
		stdout: "piped",
		stderr: "piped",
	}).spawn();

	const pump = async (stream: ReadableStream<Uint8Array>) => {
		const reader = stream.getReader();
		const dec = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			opts.onChunk(dec.decode(value, { stream: true }));
		}
	};

	void pump(proc.stdout);
	void pump(proc.stderr);

	return {
		kill: () => {
			try {
				proc.kill("SIGTERM");
			} catch {
				/* already dead */
			}
		},
		wait: proc.status,
	};
}
