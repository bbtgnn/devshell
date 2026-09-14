import { join } from "@std/path";
import {
	BUN_ENGINE_VERSION,
	ensureBunEngine,
} from "./bun-engine.ts";
import { isExecutableFile } from "./os/mod.ts";

const tmp = await Deno.makeTempDir({ prefix: "devshell-bun-dl-" });
const dataRoot = join(tmp, "data");

const prevPath = Deno.env.get("PATH");
const prevBunInstall = Deno.env.get("BUN_INSTALL");
const prevDevshellBun = Deno.env.get("DEVSHELL_BUN_PATH");
Deno.env.set("PATH", "");
Deno.env.delete("BUN_INSTALL");
Deno.env.delete("DEVSHELL_BUN_PATH");

try {
	const engine = await ensureBunEngine(dataRoot, {
		onProgress: (line) => console.log(line),
	});
	if (!isExecutableFile(engine.path)) {
		console.error("FAIL: downloaded path not executable", engine.path);
		Deno.exit(1);
	}
	if (!engine.path.includes(`bun-${BUN_ENGINE_VERSION}`)) {
		console.error("FAIL: path missing pin version", engine.path);
		Deno.exit(1);
	}

	const ver = new Deno.Command(engine.path, {
		args: ["--version"],
		stdout: "piped",
		stderr: "piped",
	}).outputSync();
	const versionText = new TextDecoder().decode(ver.stdout || ver.stderr).trim();
	if (!versionText.includes(BUN_ENGINE_VERSION)) {
		console.error("FAIL: bun --version mismatch", versionText);
		Deno.exit(1);
	}

	console.log("downloaded:", engine.path);
	console.log("bun --version:", versionText);

	const again = await ensureBunEngine(dataRoot, {
		fetch: async () => {
			throw new Error("fetch should not run when cache exists");
		},
	});
	if (again.path !== engine.path) {
		console.error("FAIL: cache reuse failed", again);
		Deno.exit(1);
	}
	console.log("OK smoke-bun-download (network + reuse)");
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
