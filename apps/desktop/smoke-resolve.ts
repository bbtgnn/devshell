import { join } from "@std/path";
import { resolveDataRoot } from "./paths.ts";
import {
	commandPathNames,
	isExecutableFile,
	pathListSeparator,
	resolveBunEngine,
} from "./runner.ts";

const DATA = resolveDataRoot();

const sep = pathListSeparator();
const expectedSep = Deno.build.os === "windows" ? ";" : ":";
if (sep !== expectedSep) {
	console.error(`FAIL: pathListSeparator=${sep}, expected ${expectedSep}`);
	Deno.exit(1);
}
console.log("pathListSeparator:", sep);

const bunNames = commandPathNames("bun");
if (Deno.build.os === "windows") {
	if (!bunNames.includes("bun.exe")) {
		console.error("FAIL: Windows commandPathNames(bun) missing bun.exe", bunNames);
		Deno.exit(1);
	}
} else if (bunNames.length !== 1 || bunNames[0] !== "bun") {
	console.error("FAIL: unexpected commandPathNames(bun)", bunNames);
	Deno.exit(1);
}
console.log("commandPathNames(bun):", bunNames.join(", "));

const trapDir = join(DATA, "trap-bun-dir", "bun");
await Deno.mkdir(trapDir, { recursive: true });
await Deno.writeTextFile(join(trapDir, "index.js"), "console.log('not a cli')\n");

const engine = resolveBunEngine(DATA);
console.log("resolveBunEngine:", engine.path);
console.log("data root:", DATA);

if (!isExecutableFile(engine.path)) {
	console.error("FAIL: resolved path is not an executable file");
	Deno.exit(1);
}
if (
	engine.path === trapDir ||
	engine.path.endsWith("/trap-bun-dir/bun") ||
	engine.path.endsWith("\\trap-bun-dir\\bun")
) {
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
console.log("OK");
