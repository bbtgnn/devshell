import {
	defaultProcessHost,
	type ProcessHost,
} from "./process-host.ts";

export type RunResult = {
	success: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
};

export type CapturedRun = {
	readonly result: Promise<RunResult>;
	stop(): Promise<void>;
};

export function runCaptured(
	cmd: string[],
	opts: {
		cwd: string;
		onLine?: (line: string, stream: "out" | "err") => void;
	},
	host: ProcessHost = defaultProcessHost(),
): CapturedRun {
	if (cmd.length === 0) {
		throw new Error("runCaptured: command must be non-empty");
	}
	const hosted = host.spawn({
		cmd: cmd as [string, ...string[]],
		cwd: opts.cwd,
	});

	let stopping: Promise<void> | null = null;

	const result = (async (): Promise<RunResult> => {
		let stdout = "";
		let stderr = "";

		const read = async (
			stream: ReadableStream<Uint8Array>,
			kind: "out" | "err",
		) => {
			const reader = stream.getReader();
			const dec = new TextDecoder();
			let buf = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = dec.decode(value, { stream: true });
				if (kind === "out") stdout += text;
				else stderr += text;
				buf += text;
				const parts = buf.split(/\r?\n/);
				buf = parts.pop() ?? "";
				for (const line of parts) {
					if (line.trim()) opts.onLine?.(line, kind);
				}
			}
			if (buf.trim()) opts.onLine?.(buf, kind);
		};

		await Promise.all([
			read(host.stdout(hosted), "out"),
			read(host.stderr(hosted), "err"),
		]);
		const status = await host.wait(hosted);
		return {
			success: status.success,
			code: status.code,
			stdout,
			stderr,
		};
	})();

	return {
		result,
		async stop() {
			if (stopping) return stopping;
			stopping = host.stop(hosted).then(async () => {
				await result;
			});
			return stopping;
		},
	};
}
