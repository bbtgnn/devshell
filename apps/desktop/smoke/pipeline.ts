import { resolveDataRoot, runCaptured } from "../os/mod.ts";
import { ensureBunEngine } from "../bun-engine.ts";
import { syncProject } from "../project-sync.ts";

const DATA = resolveDataRoot();
const DEFAULT =
	"https://github.com/withastro/astro/tree/main/examples/blog";

console.log("data root:", DATA);
const engine = await ensureBunEngine(DATA, {
	onProgress: (line) => console.log("  ", line),
});
console.log("bunEngine", engine.path);

const synced = await syncProject(DEFAULT, "", DATA, (line) =>
	console.log("  ", line)
);
console.log("sync action:", synced.action, "→", synced.workDir);

const install = await runCaptured([engine.path, "install"], {
	cwd: synced.workDir,
	onLine: (line) => console.log("  ", line),
});
if (!install.success) {
	console.error("bun install failed", install.stderr || install.stdout);
	Deno.exit(1);
}

console.log("SMOKE PIPELINE OK", {
	bunPath: engine.path,
	gitAction: synced.action,
	workDir: synced.workDir,
});
