import { dirname, fromFileUrl, join } from "@std/path";
import { existsSync } from "@std/fs";

// `deno desktop` may run from a read-only temp extract — prefer cwd when it
// looks like apps/desktop; skip deno-compile-* extract paths.
export function resolveAppRoot(): string {
	const cwd = Deno.cwd();
	if (existsSync(join(cwd, "main.ts")) && existsSync(join(cwd, "runner.ts"))) {
		return cwd;
	}
	const beside = dirname(fromFileUrl(import.meta.url));
	if (!beside.includes("deno-compile-")) return beside;
	return cwd;
}

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
