import type { ExitStatus, HostedProc, ProcessHost } from "./process-host.ts";

type WindowsProc = HostedProc & {
	child: Deno.ChildProcess;
};

function asWindows(p: HostedProc): WindowsProc {
	return p as WindowsProc;
}

function sanitizePid(pid: number): number {
	const n = Number.parseInt(String(pid), 10);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`invalid pid: ${pid}`);
	}
	return n;
}

export function windowsProcessHost(): ProcessHost {
	return {
		spawn(req) {
			const child = new Deno.Command(req.cmd[0], {
				args: req.cmd.slice(1),
				cwd: req.cwd,
				stdout: "piped",
				stderr: "piped",
			}).spawn();
			return { pid: child.pid, child } satisfies WindowsProc;
		},
		stdout(p) {
			return asWindows(p).child.stdout;
		},
		stderr(p) {
			return asWindows(p).child.stderr;
		},
		async wait(p): Promise<ExitStatus> {
			const status = await asWindows(p).child.status;
			return { code: status.code, success: status.success };
		},
		async stop(p) {
			const { child, pid } = asWindows(p);
			const safePid = sanitizePid(pid);
			try {
				await new Deno.Command("taskkill", {
					args: ["/PID", String(safePid), "/T", "/F"],
					stdout: "null",
					stderr: "null",
				}).output();
			} catch {
				// already gone or taskkill unavailable
			}
			await child.status;
		},
	};
}
