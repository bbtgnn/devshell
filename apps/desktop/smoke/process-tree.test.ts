import { assert } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { spawnLiving } from "../os/living.ts";

const here = dirname(fromFileUrl(import.meta.url));
const holdScript = join(here, "hold-port.ts");

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

Deno.test({
	name: "process-tree stop reclaims held port",
	ignore: Deno.build.os === "windows",
	fn: async () => {
		const port = pickPort();
		const deno = Deno.execPath();

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

		await waitForPort(port, 5_000);
		await living.stop();
		const exit = await living.exited;
		assert(exit.stopped, "expected exited.stopped after living.stop()");
		await assertPortFree(port, 5_000);
	},
});
