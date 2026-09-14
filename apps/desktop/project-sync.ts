import fs from "node:fs";
import { copySync, existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

export type CachedRepo = {
	id: string;
	cloneUrl: string;
	branch: string;
	localPath: string;
	lastSyncedAt: string;
	lastError?: string;
};

export type SyncProjectResult = {
	workDir: string;
	action: "cloned" | "pulled";
	repos: CachedRepo[];
};

type ParsedGithub = {
	owner: string;
	repo: string;
	cloneUrl: string;
	subdirectory: string;
	branch: string;
};

type CloneRegistry = { repos: CachedRepo[] };

function removeIfExists(path: string): void {
	try {
		Deno.removeSync(path, { recursive: true });
	} catch (err) {
		if (!(err instanceof Deno.errors.NotFound)) throw err;
	}
}

function parseGithubInput(input: string, subdirectory = ""): ParsedGithub {
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

function repoSlug(parsed: ParsedGithub): string {
	return `${parsed.owner}__${parsed.repo}`;
}

function registryPath(dataRoot: string): string {
	return join(dataRoot, "clones-registry.json");
}

function loadRegistry(dataRoot: string): CloneRegistry {
	const path = registryPath(dataRoot);
	if (!existsSync(path)) return { repos: [] };
	try {
		const raw = JSON.parse(Deno.readTextFileSync(path)) as CloneRegistry;
		return { repos: Array.isArray(raw.repos) ? raw.repos : [] };
	} catch {
		return { repos: [] };
	}
}

function saveRegistry(dataRoot: string, registry: CloneRegistry): void {
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

async function ensureRepo(
	parsed: ParsedGithub,
	dataRoot: string,
	onLine: (line: string) => void,
): Promise<{ cloneDir: string; action: "cloned" | "pulled"; repos: CachedRepo[] }> {
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
function materializeWorkDir(
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

export async function syncProject(
	repoUrl: string,
	subdirectory: string,
	dataRoot: string,
	onLine: (line: string) => void,
): Promise<SyncProjectResult> {
	const parsed = parseGithubInput(repoUrl, subdirectory);
	onLine(
		`sync ${parsed.cloneUrl} @ ${parsed.branch}${
			parsed.subdirectory ? ` / ${parsed.subdirectory}` : ""
		}`,
	);

	const ensured = await ensureRepo(parsed, dataRoot, onLine);
	const workDir = materializeWorkDir(
		ensured.cloneDir,
		parsed.subdirectory,
		dataRoot,
		onLine,
	);

	return {
		workDir,
		action: ensured.action,
		repos: ensured.repos,
	};
}
