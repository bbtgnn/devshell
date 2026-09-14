import { existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { unzipSync } from "fflate";
import type { BunEngineInfo } from "./machine.ts";
import {
	BUN_ENGINE_VERSION,
	bunReleaseUrl,
	cachedBunEnginePath,
} from "./bun-pin.ts";
import {
	cliBinaryName,
	commandPathNames,
	ensureExecutableMode,
	isExecutableFile,
	pathListSeparator,
} from "./os/mod.ts";

export {
	BUN_ENGINE_VERSION,
	bunReleaseTarget,
	bunReleaseUrl,
	cachedBunEnginePath,
} from "./bun-pin.ts";

export type EnsureBunEngineOptions = {
	onProgress?: (line: string) => void;
	fetch?: typeof globalThis.fetch;
	version?: string;
};

export class BunEngineNotFoundError extends Error {
	override name = "BunEngineNotFoundError";
}

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
export function resolveBunEngine(dataRoot?: string): BunEngineInfo {
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

	throw new BunEngineNotFoundError(
		"No Bun CLI found. Put bun on PATH, set DEVSHELL_BUN_PATH, or let Devshell download the pinned engine on start.",
	);
}

function removeIfExists(path: string): void {
	try {
		Deno.removeSync(path, { recursive: true });
	} catch (err) {
		if (!(err instanceof Deno.errors.NotFound)) throw err;
	}
}

function extractBunFromZip(zipBytes: Uint8Array, destFile: string): void {
	const want = cliBinaryName("bun");
	const files = unzipSync(zipBytes);
	const entry = Object.keys(files).find((name) => {
		const base = name.split("/").pop() ?? name;
		return base === want && !name.endsWith("/");
	});
	if (!entry) {
		throw new Error(`Bun zip did not contain ${want}`);
	}
	const data = files[entry];
	if (!data) {
		throw new Error(`Bun zip entry empty: ${entry}`);
	}
	Deno.mkdirSync(dirname(destFile), { recursive: true });
	Deno.writeFileSync(destFile, data);
	ensureExecutableMode(destFile);
}

export async function downloadPinnedBunEngine(
	dataRoot: string,
	opts: EnsureBunEngineOptions = {},
): Promise<BunEngineInfo> {
	const version = opts.version ?? BUN_ENGINE_VERSION;
	const dest = cachedBunEnginePath(dataRoot, version);
	if (isExecutableFile(dest)) {
		return { path: dest };
	}

	const fetchFn = opts.fetch ?? globalThis.fetch;
	const url = bunReleaseUrl(version);
	opts.onProgress?.(`Installing Bun ${version}…`);
	opts.onProgress?.(`download ${url}`);

	let response: Response;
	try {
		response = await fetchFn(url);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Could not download Bun ${version} (offline or network error): ${detail}`,
		);
	}
	if (!response.ok) {
		throw new Error(
			`Could not download Bun ${version}: HTTP ${response.status} from ${url}`,
		);
	}

	const staging = Deno.makeTempDirSync({ prefix: "devshell-bun-" });
	try {
		const bytes = new Uint8Array(await response.arrayBuffer());
		opts.onProgress?.(`extract ${bytes.byteLength} bytes`);
		const stagingDest = join(staging, cliBinaryName("bun"));
		extractBunFromZip(bytes, stagingDest);
		Deno.mkdirSync(dirname(dest), { recursive: true });
		Deno.copyFileSync(stagingDest, dest);
		ensureExecutableMode(dest);
		if (!isExecutableFile(dest)) {
			throw new Error(`Downloaded Bun is not executable: ${dest}`);
		}
		opts.onProgress?.(`Bun ${version} ready → ${dest}`);
		return { path: dest };
	} catch (err) {
		if (existsSync(dest)) {
			try {
				Deno.removeSync(dest);
			} catch {
				// ignore
			}
		}
		throw err;
	} finally {
		removeIfExists(staging);
	}
}

/**
 * Resolve an existing Bun engine, or download the pinned build into the Data root.
 */
export async function ensureBunEngine(
	dataRoot: string,
	opts: EnsureBunEngineOptions = {},
): Promise<BunEngineInfo> {
	try {
		return resolveBunEngine(dataRoot);
	} catch (err) {
		if (!(err instanceof BunEngineNotFoundError)) throw err;
	}
	return await downloadPinnedBunEngine(dataRoot, opts);
}
