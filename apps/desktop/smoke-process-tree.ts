/**
 * Smoke: spawn a small process tree that holds a TCP port, stop it via
 * ProcessHost, assert the port is reclaimable (tree torn down).
 */
import { dirname, fromFileUrl, join } from "@std/path";
import { spawnLiving } from "./os/living.ts";

const here = dirname(fromFileUrl(import.meta.url));
const holdScript = join(here, "smoke-hold-port.ts");

function tryListen(port: number): Deno.Listener | null {
	try {
		return Deno.listen({ hostname: "127.0.0.1", port });
	} catch {
		return null;
	}
}

function pickPort(): number {
	const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
	const { port } = listener.addr as Deno.NetAddr;
	listener.close();
	return port;
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const conn = await Deno.connect({ hostname: "127.0.0.1", port }).then(
			(c) => {
				c.close();
				return true;
			},
			() => false,
		);
		if (conn) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`port ${port} did not become reachable within ${timeoutMs}ms`);
}

async function assertPortFree(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const listener = tryListen(port);
		if (listener) {
			listener.close();
			return;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error(`port ${port} still held after stop (${timeoutMs}ms)`);
}

const port = pickPort();
const deno = Deno.execPath();

// Shell is process-group leader; Deno hold-port child must die with the group.
const living = spawnLiving(
	[
		"sh",
		"-c",
		`"${deno}" run -A "${holdScript}" ${port} & wait`,
	],
	{
		cwd: here,
		onChunk: (text) => {
			const line = text.trim();
			if (line) console.log("  ", line);
		},
	},
);

console.log(`spawned tree holding 127.0.0.1:${port}`);
await waitForPort(port, 5_000);
console.log("port is held");

await living.stop();
const exit = await living.exited;
console.log("stopped", exit);

if (!exit.stopped) {
	throw new Error("expected exited.stopped after living.stop()");
}

await assertPortFree(port, 5_000);
console.log("SMOKE PROCESS-TREE OK", { port, code: exit.code });
