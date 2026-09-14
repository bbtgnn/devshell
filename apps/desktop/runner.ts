import fs from "node:fs";
import { copySync, existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type {
	BunEngineInfo,
	CachedRepo,
} from "./machine.ts";
import { BUN_ENGINE_VERSION, cachedBunEnginePath } from "./bun-pin.ts";
import {
	commandPathNames,
	isExecutableFile,
	pathListSeparator,
} from "./os/mod.ts";

function removeIfExists(path: string): void {
	try {
		Deno.removeSync(path, { recursive: true });
	} catch (err) {
		if (!(err instanceof Deno.errors.NotFound)) throw err;
	}
}

export type ParsedGithub = {
	owner: string;
	repo: string;
	cloneUrl: string;
	subdirectory: string;
	branch: string;
};

export type BunEngine = BunEngineInfo;

// Deno.which is not available in all desktop builds.
function whichOnPath(cmd: string): string | null {
	const pathEnv = Deno.env.get("PATH") ?? "";
	const names = commandPathNames(cmd);
	for (const dir of pathEnv.split(pathListSeparator())) {
		if (!dir) continue;
		for (const name of names) {
			const candidate = join(dir, name);
			if (isExecutableFile(candidate)) return candidate;
		}
	}
	return null;
}

function firstExistingExecutable(candidates: string[]): string | null {
	for (const candidate of candidates) {
		if (isExecutableFile(candidate)) return candidate;
	}
	return null;
}

// Never treat a JS bundle directory named `bun` as the CLI (EACCES posix_spawn).
export function resolveBunEngine(dataRoot?: string): BunEngine {
	const envPath = Deno.env.get("DEVSHELL_BUN_PATH")?.trim();
	if (envPath) {
		if (!isExecutableFile(envPath)) {
			throw new Error(
				`DEVSHELL_BUN_PATH is not an executable file: ${envPath}`,
			);
		}
		return { path: envPath };
	}

	if (dataRoot) {
		const cached = cachedBunEnginePath(dataRoot, BUN_ENGINE_VERSION);
		if (isExecutableFile(cached)) {
			return { path: cached };
		}
	}

	const bunInstall = Deno.env.get("BUN_INSTALL")?.trim();
	if (bunInstall) {
		const fromInstall = firstExistingExecutable([
			join(bunInstall, "bin", "bun"),
			join(bunInstall, "bin", "bun.exe"),
		]);
		if (fromInstall) return { path: fromInstall };
	}

	const which = whichOnPath("bun");
	if (which) return { path: which };

	throw new Error(
		"No Bun CLI found. Put bun on PATH, set DEVSHELL_BUN_PATH, or let Devshell download the pinned engine on start.",
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
		const raw = JSON.parse(Deno.readTextFileSync(path)) as CloneRegistry;
		return { repos: Array.isArray(raw.repos) ? raw.repos : [] };
	} catch {
		return { repos: [] };
	}
}

export function saveRegistry(dataRoot: string, registry: CloneRegistry): void {
	Deno.mkdirSync(dataRoot, { recursive: true });
	Deno.writeTextFileSync(
		registryPath(dataRoot),
		`${JSON.stringify(registry, null, 2)}\n`,
	);
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

export async function ensureRepo(
	parsed: ParsedGithub,
	dataRoot: string,
	onLine: (line: string) => void,
): Promise<EnsureRepoResult> {
	const id = repoSlug(parsed);
	const cloneDir = join(dataRoot, "clones", id);
	const gitDir = join(cloneDir, ".git");
	Deno.mkdirSync(join(dataRoot, "clones"), { recursive: true });

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
			removeIfExists(cloneDir);
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
			removeIfExists(cloneDir);
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

// Copy monorepo subdirs so Vite/tsc do not walk up into root configs.
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
	removeIfExists(workDir);
	Deno.mkdirSync(dirname(workDir), { recursive: true });
	copySync(src, workDir);
	return workDir;
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

export { spawnLiving, type LivingExit, type LivingProcess } from "./os/mod.ts";
