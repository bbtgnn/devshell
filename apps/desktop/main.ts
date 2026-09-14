import {
	canStart,
	canStop,
	initialState,
	reduce,
	type Action,
	type SessionState,
} from "./machine.ts";
import { resolveDataRoot } from "./paths.ts";
import {
	bunDevCommand,
	bunInstallCommand,
	ensureRepo,
	extractLocalUrl,
	listCachedRepos,
	materializeWorkDir,
	parseGithubInput,
	runCaptured,
	spawnLiving,
	type LivingProcess,
} from "./runner.ts";
import { ensureBunEngine } from "./bun-engine.ts";

// Deno.BrowserWindow ships with `deno desktop` but isn't in stable lib types yet.
type DesktopWindow = {
	setTitle: (title: string) => void;
	navigate: (url: string) => void;
	show: () => void;
	focus: () => void;
	reload: () => void;
	bind: (name: string, handler: (...args: unknown[]) => unknown) => void;
};

type DesktopWindowCtor = new (opts?: {
	title?: string;
	width?: number;
	height?: number;
}) => DesktopWindow;

const BrowserWindow = (Deno as unknown as { BrowserWindow?: DesktopWindowCtor })
	.BrowserWindow;

const DATA_ROOT = resolveDataRoot();

const DEFAULT_REPO =
	"https://github.com/withastro/astro/tree/main/examples/blog";

let state: SessionState = initialState();
let living: LivingProcess | null = null;
let runToken = 0;
let previewWin!: DesktopWindow;

function dispatch(action: Action): SessionState {
	state = reduce(state, action);
	console.log(`[state] ${state.phase}`, {
		repoUrl: state.repoUrl,
		bunEngine: state.bunEngine,
		previewUrl: state.previewUrl,
		error: state.error,
		lastChanged: state.lastChanged,
	});
	return state;
}

function snapshot(s: SessionState) {
	return {
		...s,
		canStart: canStart(s),
		canStop: canStop(s),
	};
}

function stopLiving() {
	living?.kill();
	living = null;
}

async function runPipeline(repoUrl: string, subdirectory = "") {
	const token = ++runToken;
	stopLiving();
	dispatch({ type: "start", repoUrl, subdirectory });

	try {
		const engine = await ensureBunEngine(DATA_ROOT, {
			onProgress: (line) => {
				if (token !== runToken) return;
				dispatch({ type: "log", line });
			},
		});
		dispatch({
			type: "log",
			line: `bunEngine ${engine.path}`,
		});

		const parsed = parseGithubInput(repoUrl, subdirectory);
		dispatch({
			type: "log",
			line: `sync ${parsed.cloneUrl} @ ${parsed.branch}${
				parsed.subdirectory ? ` / ${parsed.subdirectory}` : ""
			}`,
		});

		const ensured = await ensureRepo(parsed, DATA_ROOT, (line) => {
			if (token !== runToken) return;
			dispatch({ type: "log", line });
		});
		if (token !== runToken) return;
		dispatch({ type: "cached_repos", repos: ensured.repos });
		dispatch({
			type: "log",
			line:
				ensured.action === "pulled"
					? `cache hit → pull (${ensured.cloneDir})`
					: `fresh clone (${ensured.cloneDir})`,
		});

		const dir = materializeWorkDir(
			ensured.cloneDir,
			parsed.subdirectory,
			DATA_ROOT,
			(line) => {
				if (token !== runToken) return;
				dispatch({ type: "log", line });
			},
		);
		const installCmd = bunInstallCommand(engine);
		const devCmd = bunDevCommand(engine, dir);
		dispatch({
			type: "ready",
			workDir: dir,
			devCommand: devCmd.join(" "),
			bunEngine: engine,
		});

		const install = await runCaptured(installCmd, {
			cwd: dir,
			onLine: (line) => {
				if (token !== runToken) return;
				dispatch({ type: "log", line });
			},
		});
		if (token !== runToken) return;
		if (!install.success) {
			throw new Error(install.stderr || install.stdout || "bun install failed");
		}

		dispatch({ type: "phase", phase: "starting" });
		dispatch({ type: "log", line: `spawn ${devCmd.join(" ")}` });
		dispatch({ type: "phase", phase: "waiting_for_url" });

		let found: string | null = null;
		living = spawnLiving(devCmd, {
			cwd: dir,
			onChunk: (text) => {
				if (token !== runToken) return;
				for (const line of text.split(/\r?\n/)) {
					if (line.trim()) dispatch({ type: "log", line });
				}
				const url = extractLocalUrl(text);
				if (url && !found) {
					found = url;
					dispatch({ type: "preview_url", url });
					openPreview(url);
				}
			},
		});

		void living.wait.then((status) => {
			if (token !== runToken) return;
			if (state.phase === "previewing" || state.phase === "waiting_for_url") {
				dispatch({
					type: "fail",
					error: `dev process exited (${status.code})`,
				});
			}
		});
	} catch (err) {
		if (token !== runToken) return;
		stopLiving();
		dispatch({
			type: "fail",
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

function openPreview(url: string) {
	previewWin.setTitle(`Preview — ${url}`);
	previewWin.navigate(url);
	previewWin.show();
	previewWin.focus();
}

function controlPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Devshell</title>
<style>
  :root {
    --bg: #f6f3ee; --ink: #1c1917; --muted: #78716c; --accent: #0f766e;
    --panel: #fffdf9; --line: #e7e5e4; --fail: #b91c1c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 15px/1.45 "Iowan Old Style", "Palatino Linotype", Palatino, serif;
    color: var(--ink);
    background:
      radial-gradient(900px 420px at 10% -10%, #d9f3ef 0%, transparent 55%),
      radial-gradient(700px 380px at 100% 0%, #fde68a55 0%, transparent 50%),
      var(--bg);
    min-height: 100vh;
  }
  main { max-width: 880px; margin: 0 auto; padding: 28px 20px 64px; }
  h1 { font-size: 1.65rem; margin: 0 0 0.35rem; letter-spacing: -0.02em; }
  .q { color: var(--muted); margin: 0 0 1.4rem; max-width: 62ch; }
  .badge {
    display: inline-block; font: 11px/1 ui-monospace, Menlo, monospace;
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent);
    border: 1px solid color-mix(in oklab, var(--accent) 40%, white);
    padding: 0.25rem 0.5rem; margin-bottom: 0.75rem;
  }
  section {
    background: var(--panel); border: 1px solid var(--line);
    padding: 1rem 1.1rem 1.15rem; margin: 0 0 1rem;
  }
  h2 {
    font-size: 0.95rem; margin: 0 0 0.75rem; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted);
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 0.35rem 0.75rem; }
  .k { color: var(--muted); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.85rem; }
  .v { font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; word-break: break-all; }
  .v.fail { color: var(--fail); }
  .changed { margin-top: 0.75rem; font-size: 0.85rem; color: var(--accent); }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  button, .tab {
    font: 13px/1.2 ui-sans-serif, system-ui, sans-serif;
    border: 1px solid var(--ink); background: var(--ink); color: white;
    padding: 0.55rem 0.8rem; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--ink); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  label {
    display: block; font-size: 0.85rem; color: var(--muted); margin: 0.4rem 0 0.2rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  input {
    width: 100%; padding: 0.55rem 0.65rem; border: 1px solid var(--line);
    background: white; font: 13px/1.3 ui-monospace, Menlo, monospace;
  }
  .tabs { display: flex; gap: 0.35rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .tab { background: transparent; color: var(--ink); }
  .tab.active { background: var(--accent); border-color: var(--accent); color: white; }
  .scenario p { margin: 0 0 0.75rem; color: var(--muted); }
  .steps { display: flex; flex-direction: column; align-items: flex-start; gap: 0.45rem; }
  pre {
    margin: 0; max-height: 220px; overflow: auto; background: #1c1917; color: #e7e5e4;
    padding: 0.75rem; font: 11px/1.4 ui-monospace, Menlo, monospace;
  }
</style>
</head>
<body>
<main>
  <div class="badge">Devshell · Deno Desktop + Bun sidecar</div>
  <h1>Sync → bun install → bun run → preview</h1>
  <p class="q">Clone/pull via isomorphic-git into the app data cache, materialize monorepo subdirs, install and run with the Bun sidecar, open a native preview.</p>

  <section>
    <h2>Current state</h2>
    <div class="grid" id="state"></div>
    <div class="changed" id="changed"></div>
  </section>

  <section>
    <h2>Cached clones</h2>
    <p style="margin:0 0 0.5rem;color:var(--muted);font-size:0.9rem">
      Persisted under the Devshell data root (<code>clones-registry.json</code>).
      Re-runs pull instead of re-cloning.
    </p>
    <div id="cached"></div>
  </section>

  <section>
    <h2>Free play</h2>
    <label for="repo">GitHub repo (owner/repo or full URL, optional /tree/branch/subdir)</label>
    <input id="repo" value="${DEFAULT_REPO}" />
    <label for="subdir">Subdirectory override (optional)</label>
    <input id="subdir" placeholder="leave blank if URL already includes a path" />
    <div class="row" style="margin-top:0.85rem">
      <button id="btn-start">Start pipeline</button>
      <button id="btn-stop" class="secondary">Stop</button>
      <button id="btn-reset" class="secondary">Reset</button>
      <button id="btn-reopen" class="secondary">Re-open preview</button>
    </div>
  </section>

  <section>
    <h2>Guided walkthroughs</h2>
    <div class="tabs" id="tabs"></div>
    <div class="scenario" id="scenario"></div>
  </section>

  <section>
    <div class="row" style="justify-content:space-between;align-items:center;margin:0 0 0.75rem">
      <h2 style="margin:0">Log tail</h2>
      <button id="btn-copy-logs" class="secondary" type="button">Copy logs</button>
    </div>
    <pre id="log"></pre>
    <p id="copy-status" style="margin:0.5rem 0 0;font-size:0.85rem;color:var(--accent);min-height:1.2em"></p>
  </section>
</main>
<script>
const DEFAULT_REPO = ${JSON.stringify(DEFAULT_REPO)};
const scenarios = [
  {
    id: "happy",
    name: "Happy path",
    blurb: "Sync the demo Project via isomorphic-git (clone or pull from data cache), materialize monorepo subdir if needed, bun install via sidecar, bun run dev, open native preview.",
    steps: [
      { label: "1. Start pipeline (demo Project)", action: "startDefault" },
      { label: "2. Re-open preview window", action: "reopen", needsUrl: true },
    ],
  },
  {
    id: "bad",
    name: "Bad URL",
    blurb: "Start with nonsense input. State should land in failed with a readable error — not hang.",
    steps: [
      { label: "1. Start with invalid input", action: "startBad" },
      { label: "2. Reset to idle", action: "reset" },
    ],
  },
  {
    id: "stop",
    name: "Stop mid-flight",
    blurb: "Kick off the happy path, then stop before preview. Confirms teardown of the bun-spawned child.",
    steps: [
      { label: "1. Start pipeline", action: "startDefault" },
      { label: "2. Stop", action: "stop" },
      { label: "3. Reset", action: "reset" },
    ],
  },
];

let active = "happy";
let stepIndex = 0;
let state = null;

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function renderState(s) {
  state = s;
  const eng = s.bunEngine;
  const fields = [
    ["phase", s.phase],
    ["repoUrl", s.repoUrl || "—"],
    ["subdirectory", s.subdirectory || "—"],
    ["bunEngine.path", eng ? eng.path : "—"],
    ["devCommand", s.devCommand || "—"],
    ["workDir", s.workDir || "—"],
    ["previewUrl", s.previewUrl || "—"],
    ["error", s.error || "—"],
  ];
  document.getElementById("state").innerHTML = fields.map(([k, v]) =>
    '<div class="k">' + k + '</div><div class="v' +
    (k === "error" && s.error ? " fail" : "") + '">' + escapeHtml(v) + "</div>"
  ).join("");
  document.getElementById("changed").textContent = s.lastChanged
    ? "Just changed: " + s.lastChanged : "";
  document.getElementById("log").textContent = (s.logTail || []).join("\\n") || "(empty)";
  const cached = s.cachedRepos || [];
  document.getElementById("cached").innerHTML = cached.length
    ? '<ul style="margin:0;padding-left:1.2rem;font:12px/1.45 ui-monospace,Menlo,monospace">' +
      cached.map((r) =>
        "<li><code>" + escapeHtml(r.id) + "</code> @ " + escapeHtml(r.branch) +
        ' <span style="color:var(--muted)">' + escapeHtml(r.lastSyncedAt) + "</span>" +
        (r.lastError ? ' <span style="color:var(--fail)">' + escapeHtml(r.lastError) + "</span>" : "") +
        "</li>"
      ).join("") +
      "</ul>"
    : '<p style="margin:0;color:var(--muted)">(none yet — start a pipeline to populate clones-registry.json)</p>';
  document.getElementById("btn-start").disabled = !s.canStart;
  document.getElementById("btn-stop").disabled = !s.canStop;
  document.getElementById("btn-reopen").disabled = !s.previewUrl;
  renderScenario();
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = scenarios.map((sc) =>
    '<button class="tab' + (sc.id === active ? " active" : "") +
    '" data-id="' + sc.id + '">' + sc.name + "</button>"
  ).join("");
}

function renderScenario() {
  const sc = scenarios.find((s) => s.id === active);
  const steps = sc.steps.map((st, i) => {
    const done = i < stepIndex;
    const current = i === stepIndex;
    const disabled = !current || (st.needsUrl && !(state && state.previewUrl));
    return '<button data-step="' + i + '"' + (disabled ? " disabled" : "") + ">" +
      (done ? "✓ " : "") + st.label + "</button>";
  }).join("");
  document.getElementById("scenario").innerHTML =
    "<p>" + sc.blurb + '</p><div class="steps">' + steps + "</div>";
}

async function runAction(name) {
  if (name === "startDefault") {
    await bindings.start({ repoUrl: DEFAULT_REPO, subdirectory: "" });
  } else if (name === "startBad") {
    await bindings.start({ repoUrl: "not-a-github-url", subdirectory: "" });
  } else if (name === "stop") {
    await bindings.stop();
  } else if (name === "reset") {
    await bindings.reset();
  } else if (name === "reopen") {
    await bindings.reopenPreview();
  }
}

document.getElementById("tabs").addEventListener("click", async (e) => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id) return;
  active = id;
  stepIndex = 0;
  await bindings.reset();
  renderTabs();
  renderScenario();
});

document.getElementById("scenario").addEventListener("click", async (e) => {
  const i = e.target.dataset && e.target.dataset.step;
  if (i == null) return;
  const sc = scenarios.find((s) => s.id === active);
  await runAction(sc.steps[Number(i)].action);
  stepIndex = Math.min(stepIndex + 1, sc.steps.length);
  renderScenario();
});

document.getElementById("btn-start").onclick = async () => {
  await bindings.start({
    repoUrl: document.getElementById("repo").value,
    subdirectory: document.getElementById("subdir").value,
  });
};
document.getElementById("btn-stop").onclick = () => bindings.stop();
document.getElementById("btn-reset").onclick = () => bindings.reset();
document.getElementById("btn-reopen").onclick = () => bindings.reopenPreview();
document.getElementById("btn-copy-logs").onclick = async () => {
  const status = document.getElementById("copy-status");
  try {
    const lines = (state && state.logTail) ? state.logTail : [];
    const text = lines.length
      ? lines.join("\\n")
      : (document.getElementById("log").textContent || "");
    await navigator.clipboard.writeText(text === "(empty)" ? "" : text);
    status.textContent = "Copied " + lines.length + " lines";
  } catch (err) {
    status.textContent = "Copy failed: " + (err && err.message ? err.message : String(err));
  }
  setTimeout(() => { status.textContent = ""; }, 2000);
};

renderTabs();
bindings.pollState().then(renderState);
setInterval(() => bindings.pollState().then(renderState), 350);
</script>
</body>
</html>`;
}

function bindWindow(win: DesktopWindow) {
	win.bind("pollState", () => snapshot(state));
	win.bind("start", (payload: unknown) => {
		const p = payload as { repoUrl: string; subdirectory?: string };
		void runPipeline(p.repoUrl, p.subdirectory ?? "");
		return snapshot(state);
	});
	win.bind("stop", () => {
		runToken++;
		stopLiving();
		return snapshot(dispatch({ type: "stop" }));
	});
	win.bind("reset", () => {
		runToken++;
		stopLiving();
		return snapshot(dispatch({ type: "reset" }));
	});
	win.bind("reopenPreview", () => {
		if (state.previewUrl) openPreview(state.previewUrl);
		return snapshot(state);
	});
}

if (!BrowserWindow) {
	console.error(
		"Deno.BrowserWindow is missing. From apps/desktop run:\n  deno task desktop",
	);
	Deno.exit(1);
}

await Deno.mkdir(DATA_ROOT, { recursive: true });
console.log(`data root: ${DATA_ROOT}`);
dispatch({ type: "cached_repos", repos: listCachedRepos(DATA_ROOT) });

try {
	const engine = await ensureBunEngine(DATA_ROOT, {
		onProgress: (line) => console.log(line),
	});
	console.log(`bunEngine at boot: ${engine.path}`);
} catch (err) {
	console.warn(
		"bunEngine ensure failed at boot:",
		err instanceof Error ? err.message : err,
	);
}

const controlWin = new BrowserWindow({
	title: "Devshell (control)",
	width: 920,
	height: 860,
});

previewWin = new BrowserWindow({
	title: "Preview (waiting…)",
	width: 1100,
	height: 760,
});
previewWin.navigate(
	"data:text/html," +
		encodeURIComponent(`<!doctype html><meta charset=utf-8>
<title>Waiting</title>
<body style="font:16px/1.4 system-ui;padding:2rem;background:#111;color:#eee">
<h1>Preview</h1>
<p>Start the pipeline from the control window. The Project local URL will open here.</p>
</body>`),
);

bindWindow(controlWin);

Deno.serve(async (req) => {
	const url = new URL(req.url);
	if (url.pathname === "/" || url.pathname === "/index.html") {
		return new Response(controlPage(), {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	}
	if (url.pathname === "/api/state") {
		return Response.json(snapshot(state));
	}
	return new Response("Not found", { status: 404 });
});

console.log("Devshell ready — Deno Desktop + Bun sidecar (control + preview).");
