import {
	defaultProcessHost,
	type ProcessHost,
} from "./process-host.ts";

export type LivingExit = {
	code: number | null;
	stopped: boolean;
};

export type LivingProcess = {
	stop(): Promise<void>;
	readonly exited: Promise<LivingExit>;
};

export function spawnLiving(
	cmd: string[],
	opts: {
		cwd: string;
		onChunk: (text: string) => void;
	},
	host: ProcessHost = defaultProcessHost(),
): LivingProcess {
	if (cmd.length === 0) {
		throw new Error("spawnLiving: command must be non-empty");
	}
	const hosted = host.spawn({
		cmd: cmd as [string, ...string[]],
		cwd: opts.cwd,
	});

	let stopped = false;
	let stopping: Promise<void> | null = null;

	const pump = async (stream: ReadableStream<Uint8Array>) => {
		const reader = stream.getReader();
		const dec = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			opts.onChunk(dec.decode(value, { stream: true }));
		}
	};

	void pump(host.stdout(hosted));
	void pump(host.stderr(hosted));

	const exited = host.wait(hosted).then((status) => ({
		code: status.code,
		stopped,
	}));

	return {
		async stop() {
			if (stopping) return stopping;
			stopped = true;
			stopping = host.stop(hosted).then(async () => {
				await exited;
			});
			return stopping;
		},
		exited,
	};
}
