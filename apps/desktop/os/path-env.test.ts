import { assert, assertEquals } from "@std/assert";
import { commandPathNames, pathListSeparator } from "./path-env.ts";

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
