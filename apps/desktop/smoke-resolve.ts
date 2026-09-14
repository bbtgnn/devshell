import { join } from "@std/path";
import { resolveAppRoot, resolveDataRoot } from "./paths.ts";
import {
	formatBunEngine,
	isExecutableFile,
	resolveBunEngine,
} from "./runner.ts";

const HERE = resolveAppRoot();
const DATA = resolveDataRoot();

// Trap: a directory named `bun` must never win resolveBunEngine.
const trapDir = join(DATA, "trap-bun-dir", "bun");
await Deno.mkdir(trapDir, { recursive: true });
await Deno.writeTextFile(join(trapDir, "index.js"), "console.log('not a cli')\n");

const engine = resolveBunEngine(HERE);
console.log("resolveBunEngine:", formatBunEngine(engine));
console.log("data root:", DATA);

if (!isExecutableFile(engine.path)) {
	console.error("FAIL: resolved path is not an executable file");
	Deno.exit(1);
}
if (engine.path === trapDir || engine.path.endsWith("/trap-bun-dir/bun")) {
	console.error("FAIL: picked directory named bun");
	Deno.exit(1);
}

const ver = new Deno.Command(engine.path, {
	args: ["--version"],
	stdout: "piped",
	stderr: "piped",
}).outputSync();
console.log(
	"bun --version:",
	new TextDecoder().decode(ver.stdout || ver.stderr).trim(),
);
console.log(
	"OK",
	engine.source === "embedded" ? "(embedded binary)" : "(PATH bun)",
);
