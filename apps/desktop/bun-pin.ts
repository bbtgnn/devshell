import { join } from "@std/path";
import { cliBinaryName } from "./os/mod.ts";

/** Pinned Bun CLI version downloaded into the Data root when no local engine exists. */
export const BUN_ENGINE_VERSION = "1.3.12";

export function bunReleaseTarget(
	os: typeof Deno.build.os = Deno.build.os,
	arch: typeof Deno.build.arch = Deno.build.arch,
): string {
	const cpu = arch === "aarch64" ? "aarch64" : "x64";
	switch (os) {
		case "darwin":
			return `darwin-${cpu}`;
		case "windows":
			return `windows-${cpu}`;
		case "linux":
			return `linux-${cpu}`;
		default:
			throw new Error(`Unsupported OS for Bun engine download: ${os}`);
	}
}

export function bunReleaseUrl(
	version: string = BUN_ENGINE_VERSION,
	os: typeof Deno.build.os = Deno.build.os,
	arch: typeof Deno.build.arch = Deno.build.arch,
): string {
	const target = bunReleaseTarget(os, arch);
	return `https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-${target}.zip`;
}

export function cachedBunEnginePath(
	dataRoot: string,
	version: string = BUN_ENGINE_VERSION,
): string {
	return join(dataRoot, "engine", `bun-${version}`, cliBinaryName("bun"));
}
