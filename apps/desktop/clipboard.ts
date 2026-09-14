/** Write text to the system clipboard (OS clipboard CLI). */

async function pipeToCommand(
	cmd: string,
	args: string[],
	text: string,
): Promise<void> {
	const proc = new Deno.Command(cmd, {
		args,
		stdin: "piped",
		stdout: "null",
		stderr: "piped",
	}).spawn();
	const writer = proc.stdin.getWriter();
	await writer.write(new TextEncoder().encode(text));
	await writer.close();
	const status = await proc.status;
	if (!status.success) {
		throw new Error(`${cmd} exited ${status.code}`);
	}
}

export async function writeClipboard(text: string): Promise<void> {
	switch (Deno.build.os) {
		case "darwin":
			await pipeToCommand("pbcopy", [], text);
			return;
		case "windows":
			await pipeToCommand("clip", [], text);
			return;
		default: {
			const errors: string[] = [];
			for (const [cmd, args] of [
				["wl-copy", []],
				["xclip", ["-selection", "clipboard"]],
				["xsel", ["--clipboard", "--input"]],
			] as const) {
				try {
					await pipeToCommand(cmd, [...args], text);
					return;
				} catch (err) {
					errors.push(
						`${cmd}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}
			throw new Error(
				`No clipboard helper worked (wl-copy / xclip / xsel). ${errors.join("; ")}`,
			);
		}
	}
}
