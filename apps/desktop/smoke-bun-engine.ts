import { join } from "node:path";
import { mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import {
	BUN_ENGINE_VERSION,
	bunReleaseUrl,
	cachedBunEnginePath,
	ensureBunEngine,
} from "./bun-engine.ts";
import { isExecutableFile } from "./runner.ts";

const tmp = await Deno.makeTempDir({ prefix: "devshell-bun-engine-" });
const dataRoot = join(tmp, "data");

const expectedUrl = bunReleaseUrl(BUN_ENGINE_VERSION);
if (!expectedUrl.includes(`/bun-v${BUN_ENGINE_VERSION}/`)) {
	console.error("FAIL: bunReleaseUrl missing pin", expectedUrl);
	Deno.exit(1);
}
if (!expectedUrl.endsWith(".zip")) {
	console.error("FAIL: bunReleaseUrl not a zip", expectedUrl);
	Deno.exit(1);
}
console.log("bunReleaseUrl:", expectedUrl);

const cachePath = cachedBunEnginePath(dataRoot);
const expectedName = Deno.build.os === "windows" ? "bun.exe" : "bun";
if (!cachePath.endsWith(join("engine", `bun-${BUN_ENGINE_VERSION}`, expectedName))) {
	console.error("FAIL: unexpected cache path", cachePath);
	Deno.exit(1);
}
console.log("cache path:", cachePath);

const prevPath = Deno.env.get("PATH");
const prevBunInstall = Deno.env.get("BUN_INSTALL");
const prevDevshellBun = Deno.env.get("DEVSHELL_BUN_PATH");
Deno.env.set("PATH", "");
Deno.env.delete("BUN_INSTALL");
Deno.env.delete("DEVSHELL_BUN_PATH");

let offlineOk = false;
try {
	await ensureBunEngine(dataRoot, {
		fetch: async () => {
			throw new TypeError("network down");
		},
	});
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	if (/download|offline|network|Bun/i.test(msg)) {
		offlineOk = true;
		console.log("offline fail:", msg);
	} else {
		console.error("FAIL: unexpected offline error:", msg);
		Deno.exit(1);
	}
}
if (!offlineOk) {
	console.error("FAIL: expected offline ensureBunEngine to throw");
	Deno.exit(1);
}

mkdirSync(join(cachePath, ".."), { recursive: true });
writeFileSync(cachePath, "#!/bin/sh\necho fake-bun\n");
if (Deno.build.os !== "windows") chmodSync(cachePath, 0o755);

let fetchCalled = false;
const cached = await ensureBunEngine(dataRoot, {
	fetch: async () => {
		fetchCalled = true;
		throw new Error("fetch should not run on cache hit");
	},
});
if (fetchCalled) {
	console.error("FAIL: fetch ran on cache hit");
	Deno.exit(1);
}
if (cached.path !== cachePath) {
	console.error("FAIL: path mismatch", cached.path, cachePath);
	Deno.exit(1);
}
if (!isExecutableFile(cached.path)) {
	console.error("FAIL: cached path not executable");
	Deno.exit(1);
}
console.log("cache hit:", cached.path);

rmSync(tmp, { recursive: true, force: true });
if (prevPath != null) Deno.env.set("PATH", prevPath);
else Deno.env.delete("PATH");
if (prevBunInstall != null) Deno.env.set("BUN_INSTALL", prevBunInstall);
if (prevDevshellBun != null) Deno.env.set("DEVSHELL_BUN_PATH", prevDevshellBun);

console.log("OK smoke-bun-engine (offline + cache hit)");
