import { resolveAppRoot, resolveDataRoot } from "./paths.ts";
import {
	bunInstallCommand,
	detectPackageManager,
	ensureRepo,
	formatBunEngine,
	materializeWorkDir,
	parseGithubInput,
	resolveBunEngine,
	runCaptured,
} from "./runner.ts";

const DATA = resolveDataRoot();
const DEFAULT =
	"https://github.com/withastro/astro/tree/main/examples/blog";

console.log("data root:", DATA);
const engine = resolveBunEngine(resolveAppRoot());
console.log("bunEngine", formatBunEngine(engine));

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
const pm = detectPackageManager(dir);
console.log("workDir:", dir);
console.log("lockfile PM (info):", pm);

const install = await runCaptured(bunInstallCommand(engine), {
	cwd: dir,
	onLine: (line) => console.log("  ", line),
});
if (!install.success) {
	console.error("bun install failed", install.stderr || install.stdout);
	Deno.exit(1);
}

console.log("SMOKE PIPELINE OK", {
	source: engine.source,
	systemNodePresent: engine.systemNodePresent,
	gitAction: ensured.action,
	workDir: dir,
});
