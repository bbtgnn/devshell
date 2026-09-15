export { resolveDataRoot } from "./paths.ts";
export {
	cliBinaryName,
	commandPathNames,
	ensureExecutableMode,
	isExecutableFile,
	pathListSeparator,
} from "./path-env.ts";
export { spawnLiving, type LivingExit, type LivingProcess } from "./living.ts";
export {
	runCaptured,
	type CapturedRun,
	type RunResult,
} from "./run-captured.ts";
export {
	defaultProcessHost,
	type ExitStatus,
	type HostedProc,
	type ProcessHost,
} from "./process-host.ts";
export { posixProcessHost } from "./process-host-posix.ts";
export { windowsProcessHost } from "./process-host-windows.ts";
