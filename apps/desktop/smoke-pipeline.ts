import { resolveDataRoot } from "./paths.ts";
import { ensureBunEngine } from "./bun-engine.ts";
import {
	bunInstallCommand,
	ensureRepo,
	materializeWorkDir,
	parseGithubInput,
	runCaptured,
} from "./runner.ts";

const DATA = resolveDataRoot();
const DEFAULT =
	"https://github.com/withastro/astro/tree/main/examples/blog";

console.log("data root:", DATA);
const engine = await ensureBunEngine(DATA, {
	onProgress: (line) => console.log("  ", line),
});
console.log("bunEngine", engine.path);

const parsed = parseGithubInput(DEFAULT);
console.log("sync", parsed);
const ensured = await ensureRepo(parsed, DATA, (line) => console.log("  ", line));
console.log("ensureRepo action:", ensured.action, "→", ensured.cloneDir);

const dir = materializeWorkDir(
	ensured.cloneDir,
	parsed.subdirectory,
	DATA,
	(line) => console.log("  ", line),
);
console.log("workDir:", dir);

const install = await runCaptured(bunInstallCommand(engine), {
	cwd: dir,
	onLine: (line) => console.log("  ", line),
});
if (!install.success) {
	console.error("bun install failed", install.stderr || install.stdout);
	Deno.exit(1);
}

console.log("SMOKE PIPELINE OK", {
	bunPath: engine.path,
	gitAction: ensured.action,
	workDir: dir,
});
