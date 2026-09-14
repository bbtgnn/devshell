import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import type { BunEngineInfo } from "./machine.ts";
import {
	BUN_ENGINE_VERSION,
	bunReleaseUrl,
	cachedBunEnginePath,
} from "./bun-pin.ts";
import { isExecutableFile, resolveBunEngine } from "./runner.ts";

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

function extractBunFromZip(zipBytes: Uint8Array, destFile: string): void {
	const want = Deno.build.os === "windows" ? "bun.exe" : "bun";
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
	mkdirSync(dirname(destFile), { recursive: true });
	writeFileSync(destFile, data);
	if (Deno.build.os !== "windows") chmodSync(destFile, 0o755);
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

	const staging = mkdtempSync(join(tmpdir(), "devshell-bun-"));
	try {
		const bytes = new Uint8Array(await response.arrayBuffer());
		opts.onProgress?.(`extract ${bytes.byteLength} bytes`);
		const stagingDest = join(
			staging,
			Deno.build.os === "windows" ? "bun.exe" : "bun",
		);
		extractBunFromZip(bytes, stagingDest);
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(stagingDest, dest);
		if (Deno.build.os !== "windows") chmodSync(dest, 0o755);
		if (!isExecutableFile(dest)) {
			throw new Error(`Downloaded Bun is not executable: ${dest}`);
		}
		opts.onProgress?.(`Bun ${version} ready → ${dest}`);
		return { path: dest };
	} catch (err) {
		if (existsSync(dest)) {
			try {
				rmSync(dest);
			} catch {
				// ignore
			}
		}
		throw err;
	} finally {
		rmSync(staging, { recursive: true, force: true });
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
