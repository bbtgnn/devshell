import { join } from "@std/path";

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
