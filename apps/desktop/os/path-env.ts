export function pathListSeparator(): string {
	return Deno.build.os === "windows" ? ";" : ":";
}

/** Names to try when resolving a command on PATH (Windows adds .exe/.cmd/.bat). */
export function commandPathNames(cmd: string): string[] {
	if (Deno.build.os !== "windows") return [cmd];
	if (/\.(exe|cmd|bat|com)$/i.test(cmd)) return [cmd];
	return [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`, cmd];
}

export function cliBinaryName(base: string): string {
	if (Deno.build.os !== "windows") return base;
	if (/\.(exe|cmd|bat|com)$/i.test(base)) return base;
	return `${base}.exe`;
}

// Dirs can pass X_OK alone on macOS — require a regular file.
// Windows file modes often lack Unix execute bits; treat regular files as OK.
export function isExecutableFile(path: string): boolean {
	try {
		const st = Deno.statSync(path);
		if (!st.isFile) return false;
		if (Deno.build.os !== "windows" && st.mode != null && (st.mode & 0o111) === 0) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

export function ensureExecutableMode(path: string): void {
	if (Deno.build.os === "windows") return;
	Deno.chmodSync(path, 0o755);
}
