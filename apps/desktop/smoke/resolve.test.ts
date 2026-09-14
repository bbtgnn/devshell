import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
	commandPathNames,
	isExecutableFile,
	pathListSeparator,
	resolveDataRoot,
} from "../os/mod.ts";
import { resolveBunEngine } from "../bun-engine.ts";

Deno.test("pathListSeparator matches platform", () => {
	const sep = pathListSeparator();
	const expectedSep = Deno.build.os === "windows" ? ";" : ":";
	assertEquals(sep, expectedSep);
});

Deno.test("commandPathNames(bun) matches platform", () => {
	const bunNames = commandPathNames("bun");
	if (Deno.build.os === "windows") {
		assert(bunNames.includes("bun.exe"));
	} else {
		assertEquals(bunNames, ["bun"]);
	}
});

Deno.test("resolveBunEngine skips directory named bun", async () => {
	const DATA = resolveDataRoot();
	const trapDir = join(DATA, "trap-bun-dir", "bun");
	await Deno.mkdir(trapDir, { recursive: true });
	await Deno.writeTextFile(join(trapDir, "index.js"), "console.log('not a cli')\n");

	const engine = resolveBunEngine(DATA);
	assert(isExecutableFile(engine.path));
	assert(
		engine.path !== trapDir &&
			!engine.path.endsWith("/trap-bun-dir/bun") &&
			!engine.path.endsWith("\\trap-bun-dir\\bun"),
		`picked directory named bun: ${engine.path}`,
	);

	const ver = new Deno.Command(engine.path, {
		args: ["--version"],
		stdout: "piped",
		stderr: "piped",
	}).outputSync();
	assert(ver.success || ver.stdout.length > 0 || ver.stderr.length > 0);
});
