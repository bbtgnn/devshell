import { join } from "node:path";
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

const HERE = resolveAppRoot();
const DATA = resolveDataRoot();
const DEFAULT =
	"https://github.com/withastro/astro/tree/main/examples/blog";

console.log("data root:", DATA);
const engine = resolveBunEngine(HERE);
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
console.log("bun install OK (systemNode required? no — used bun sidecar)");

const script = join(HERE, "inspect-content-config.mjs");
const inspect = await runCaptured([engine.path, script, dir], {
	cwd: dir,
	onLine: (line) => console.log("  ", line),
});
const raw = (inspect.stdout || inspect.stderr || "").trim();
let parsedJson: unknown;
try {
	parsedJson = JSON.parse(raw);
} catch {
	console.error("inspect did not return JSON:", raw.slice(0, 500));
	Deno.exit(1);
}
console.log("inspect:", JSON.stringify(parsedJson, null, 2).slice(0, 800));
console.log("SMOKE PIPELINE OK", {
	source: engine.source,
	systemNodePresent: engine.systemNodePresent,
	gitAction: ensured.action,
});
