/** Long-lived child used by smoke-process-tree — holds a TCP port until killed. */
const port = Number(Deno.args[0]);
if (!Number.isFinite(port) || port <= 0) {
	console.error("usage: smoke-hold-port.ts <port>");
	Deno.exit(1);
}

const listener = Deno.listen({ hostname: "127.0.0.1", port });
console.log(`holding ${port}`);

// Accept loop keeps the process alive and the port bound.
for await (const conn of listener) {
	conn.close();
}
