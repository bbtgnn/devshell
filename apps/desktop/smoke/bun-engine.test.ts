import { assert, assertEquals, assertMatch, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
	BUN_ENGINE_VERSION,
	bunReleaseUrl,
	cachedBunEnginePath,
	ensureBunEngine,
} from "../bun-engine.ts";
import {
	cliBinaryName,
	ensureExecutableMode,
	isExecutableFile,
} from "../os/mod.ts";

Deno.test("bunReleaseUrl pins version zip", () => {
	const expectedUrl = bunReleaseUrl(BUN_ENGINE_VERSION);
	assert(expectedUrl.includes(`/bun-v${BUN_ENGINE_VERSION}/`));
	assert(expectedUrl.endsWith(".zip"));
});

Deno.test("cachedBunEnginePath layout", () => {
	const dataRoot = join("/tmp", "data");
	const cachePath = cachedBunEnginePath(dataRoot);
	const expectedName = cliBinaryName("bun");
	assert(
		cachePath.endsWith(join("engine", `bun-${BUN_ENGINE_VERSION}`, expectedName)),
	);
});

Deno.test("ensureBunEngine offline fail + cache hit", async () => {
	const tmp = await Deno.makeTempDir({ prefix: "devshell-bun-engine-" });
	const dataRoot = join(tmp, "data");
	const cachePath = cachedBunEnginePath(dataRoot);

	const prevPath = Deno.env.get("PATH");
	const prevBunInstall = Deno.env.get("BUN_INSTALL");
	const prevDevshellBun = Deno.env.get("DEVSHELL_BUN_PATH");
	Deno.env.set("PATH", "");
	Deno.env.delete("BUN_INSTALL");
	Deno.env.delete("DEVSHELL_BUN_PATH");

	try {
		const err = await assertRejects(() =>
			ensureBunEngine(dataRoot, {
				fetch: async () => {
					throw new TypeError("network down");
				},
			})
		);
		assertMatch(
			err instanceof Error ? err.message : String(err),
			/download|offline|network|Bun/i,
		);

		Deno.mkdirSync(join(cachePath, ".."), { recursive: true });
		Deno.writeTextFileSync(cachePath, "#!/bin/sh\necho fake-bun\n");
		ensureExecutableMode(cachePath);

		let fetchCalled = false;
		const cached = await ensureBunEngine(dataRoot, {
			fetch: async () => {
				fetchCalled = true;
				throw new Error("fetch should not run on cache hit");
			},
		});
		assert(!fetchCalled);
		assertEquals(cached.path, cachePath);
		assert(isExecutableFile(cached.path));
	} finally {
		try {
			Deno.removeSync(tmp, { recursive: true });
		} catch (err) {
			if (!(err instanceof Deno.errors.NotFound)) throw err;
		}
		if (prevPath != null) Deno.env.set("PATH", prevPath);
		else Deno.env.delete("PATH");
		if (prevBunInstall != null) Deno.env.set("BUN_INSTALL", prevBunInstall);
		if (prevDevshellBun != null) Deno.env.set("DEVSHELL_BUN_PATH", prevDevshellBun);
	}
});
