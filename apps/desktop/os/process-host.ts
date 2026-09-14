import { posixProcessHost } from "./process-host-posix.ts";
import { windowsProcessHost } from "./process-host-windows.ts";

export type ExitStatus = {
	code: number | null;
	success: boolean;
};

/** Opaque handle owned by a ProcessHost. */
export type HostedProc = {
	readonly pid: number;
};

export type ProcessHost = {
	spawn(req: { cmd: readonly [string, ...string[]]; cwd: string }): HostedProc;
	stdout(p: HostedProc): ReadableStream<Uint8Array>;
	stderr(p: HostedProc): ReadableStream<Uint8Array>;
	wait(p: HostedProc): Promise<ExitStatus>;
	/** Tear down the Guest process tree. */
	stop(p: HostedProc): Promise<void>;
};

export function defaultProcessHost(): ProcessHost {
	return Deno.build.os === "windows"
		? windowsProcessHost()
		: posixProcessHost();
}
