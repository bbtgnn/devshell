/**
 * PROTOTYPE — load host content.config.ts via Vite SSR and evaluate Zod schemas.
 * Resolves `vite` from the target project's node_modules.
 *
 *   node inspect-content-config.mjs [projectRoot]
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] || process.cwd());
const candidates = [
	"src/content.config.ts",
	"src/content.config.mjs",
	"src/content.config.js",
	"src/content.config.mts",
];

function findConfig() {
	for (const rel of candidates) {
		if (existsSync(join(root, rel))) return "/" + rel;
	}
	return null;
}

function stubAstroContent() {
	const virtualId = "\0astro:content-stub";
	return {
		name: "stub-astro-content",
		enforce: "pre",
		resolveId(id) {
			if (id === "astro:content") return virtualId;
		},
		load(id) {
			if (id !== virtualId) return;
			return `
        export function defineCollection(config) { return config; }
        export function reference(name) {
          return { type: "reference", collection: name };
        }
      `;
		},
	};
}

function summarizeSchema(schema) {
	if (!schema || typeof schema !== "object") return { kind: typeof schema };
	const shape =
		schema.shape && typeof schema.shape === "object"
			? Object.keys(schema.shape)
			: null;
	return {
		kind: "zod",
		hasSafeParse: typeof schema.safeParse === "function",
		fields: shape,
	};
}

const configPath = findConfig();
if (!configPath) {
	console.log(
		JSON.stringify({ ok: false, error: "no content.config.* under src/" }),
	);
	process.exit(1);
}

const requireFromProject = createRequire(join(root, "package.json"));
let createServer;
try {
	const viteEntry = requireFromProject.resolve("vite");
	({ createServer } = await import(pathToFileURL(viteEntry).href));
} catch (err) {
	console.log(
		JSON.stringify({
			ok: false,
			root,
			error: `cannot resolve vite in project: ${
				err instanceof Error ? err.message : String(err)
			}`,
		}),
	);
	process.exit(1);
}

const server = await createServer({
	root,
	server: { middlewareMode: true },
	appType: "custom",
	logLevel: "error",
	plugins: [stubAstroContent()],
});

try {
	const mod = await server.ssrLoadModule(configPath);
	const collections = mod.collections;
	if (!collections || typeof collections !== "object") {
		console.log(
			JSON.stringify({
				ok: false,
				error: "no export const collections",
				configPath,
			}),
		);
		process.exit(1);
	}

	const { z } = await server.ssrLoadModule("/node_modules/astro/dist/zod.js");
	const imageStub = () => z.string();

	const out = [];
	for (const [name, def] of Object.entries(collections)) {
		if (!def || typeof def !== "object") continue;
		let schema = def.schema;
		if (typeof schema === "function") {
			schema = schema({ image: imageStub });
		}
		let parseSmoke = null;
		if (schema && typeof schema.safeParse === "function") {
			const empty = schema.safeParse({});
			parseSmoke = {
				emptyAccepted: empty.success,
				issueCount: empty.success ? 0 : empty.error.issues.length,
				sampleIssues: empty.success
					? []
					: empty.error.issues.slice(0, 5).map((i) => ({
							path: i.path.join("."),
							message: i.message,
						})),
			};
		}
		out.push({
			name,
			loader:
				def.loader?.name ?? (typeof def.loader === "function" ? "fn" : null),
			schema: summarizeSchema(schema),
			parseSmoke,
		});
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				root,
				configPath,
				method: "vite.ssrLoadModule + astro:content stub",
				collections: out,
			},
			null,
			2,
		),
	);
} catch (err) {
	console.log(
		JSON.stringify({
			ok: false,
			root,
			configPath,
			error: err instanceof Error ? err.message : String(err),
		}),
	);
	process.exit(1);
} finally {
	await server.close();
}
