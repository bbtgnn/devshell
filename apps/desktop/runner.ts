import { existsSync } from "@std/fs";
import { join } from "@std/path";
import type { BunEngineInfo } from "./machine.ts";

export function bunInstallCommand(engine: BunEngineInfo): string[] {
	return [engine.path, "install"];
}

export function bunDevCommand(engine: BunEngineInfo, dir: string): string[] {
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

export function extractLocalUrl(chunk: string): string | null {
	const match = chunk.match(
		/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s"'<>]*/i,
	);
	if (!match) return null;
	return match[0]
		.replace("0.0.0.0", "127.0.0.1")
		.replace(/[),.;]+$/, "");
}

export {
	runCaptured,
	spawnLiving,
	type LivingExit,
	type LivingProcess,
	type RunResult,
} from "./os/mod.ts";
