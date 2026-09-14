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
	ensureExecutableMode,
	isExecutableFile,
} from "./os/mod.ts";
import { resolveBunEngine } from "./runner.ts";

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
	} catch {
		// fall through to download
	}
	return await downloadPinnedBunEngine(dataRoot, opts);
}
