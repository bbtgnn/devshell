/**
 * App root (source tree) vs durable data root (clone cache / work dirs).
 * `deno desktop` may run from a read-only temp extract — prefer cwd when it
 * looks like apps/desktop.
 */

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Directory containing main.ts / runner.ts (the desktop app sources). */
export function resolveAppRoot(): string {
	const cwd = Deno.cwd();
	if (existsSync(join(cwd, "main.ts")) && existsSync(join(cwd, "runner.ts"))) {
		return cwd;
	}
	const beside = dirname(fileURLToPath(import.meta.url));
	if (!beside.includes("deno-compile-")) return beside;
	return cwd;
}

/**
 * Durable clone + work cache. Override with DEVSHELL_DATA_DIR.
 * Default: macOS Application Support / XDG data home / Windows LOCALAPPDATA.
 */
export function resolveDataRoot(): string {
	const override = Deno.env.get("DEVSHELL_DATA_DIR")?.trim();
	if (override) return override;

	const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
	if (!home) {
		throw new Error("Cannot resolve data root: HOME / USERPROFILE unset");
	}

	switch (Deno.build.os) {
		case "darwin":
			return join(home, "Library", "Application Support", "Devshell");
		case "windows": {
			const local = Deno.env.get("LOCALAPPDATA");
			return local
				? join(local, "Devshell")
				: join(home, "AppData", "Local", "Devshell");
		}
		default: {
			const xdg = Deno.env.get("XDG_DATA_HOME") ?? join(home, ".local", "share");
			return join(xdg, "devshell");
		}
	}
}
