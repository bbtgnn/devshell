import type { ExitStatus, HostedProc, ProcessHost } from "./process-host.ts";

type PosixProc = HostedProc & {
	child: Deno.ChildProcess;
};

function asPosix(p: HostedProc): PosixProc {
	return p as PosixProc;
}

function sanitizePid(pid: number): number {
	const n = Number.parseInt(String(pid), 10);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`invalid pid: ${pid}`);
	}
	return n;
}

function killGroup(pid: number, signal: Deno.Signal): void {
	try {
		Deno.kill(-pid, signal);
	} catch {
		// already dead / no such process group
	}
}

const STOP_GRACE_MS = 2_000;

export function posixProcessHost(): ProcessHost {
	return {
		spawn(req) {
			const child = new Deno.Command(req.cmd[0], {
				args: req.cmd.slice(1),
				cwd: req.cwd,
				stdout: "piped",
				stderr: "piped",
				detached: true,
			}).spawn();
			return { pid: child.pid, child } satisfies PosixProc;
		},
		stdout(p) {
			return asPosix(p).child.stdout;
		},
		stderr(p) {
			return asPosix(p).child.stderr;
		},
		async wait(p): Promise<ExitStatus> {
			const status = await asPosix(p).child.status;
			return { code: status.code, success: status.success };
		},
		async stop(p) {
			const { child, pid } = asPosix(p);
			const group = sanitizePid(pid);
			killGroup(group, "SIGTERM");

			const exited = child.status.then(() => true);
			const timedOut = new Promise<boolean>((resolve) => {
				setTimeout(() => resolve(false), STOP_GRACE_MS);
			});
			const finished = await Promise.race([exited, timedOut]);
			if (!finished) {
				killGroup(group, "SIGKILL");
				await child.status;
			}
		},
	};
}
