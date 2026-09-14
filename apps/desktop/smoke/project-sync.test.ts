import {
	assertEquals,
	assertRejects,
	assertThrows,
} from "@std/assert";
import { existsSync } from "@std/fs";
import { join, dirname } from "@std/path";
import fs from "node:fs";
import git from "isomorphic-git";
import {
	listCachedRepos,
	parseGithubInput,
	syncProject,
} from "../project-sync.ts";

async function seedLocalClone(
	dataRoot: string,
	owner: string,
	repo: string,
	files: Record<string, string>,
	branch = "main",
): Promise<string> {
	const cloneDir = join(dataRoot, "clones", `${owner}__${repo}`);
	Deno.mkdirSync(cloneDir, { recursive: true });
	await git.init({ fs, dir: cloneDir, defaultBranch: branch });

	for (const [rel, contents] of Object.entries(files)) {
		const abs = join(cloneDir, rel);
		Deno.mkdirSync(dirname(abs), { recursive: true });
		Deno.writeTextFileSync(abs, contents);
		await git.add({ fs, dir: cloneDir, filepath: rel });
	}

	await git.commit({
		fs,
		dir: cloneDir,
		message: "seed",
		author: { name: "devshell-smoke", email: "smoke@devshell.local" },
	});
	return cloneDir;
}

Deno.test("parseGithubInput owner/repo and tree URL", () => {
	assertEquals(parseGithubInput("acme/widgets"), {
		owner: "acme",
		repo: "widgets",
		cloneUrl: "https://github.com/acme/widgets.git",
		subdirectory: "",
		branch: "main",
	});

	assertEquals(
		parseGithubInput("https://github.com/acme/widgets/tree/develop/apps/web"),
		{
			owner: "acme",
			repo: "widgets",
			cloneUrl: "https://github.com/acme/widgets.git",
			subdirectory: "apps/web",
			branch: "develop",
		},
	);

	assertEquals(
		parseGithubInput("https://github.com/acme/widgets.git", "packages/core"),
		{
			owner: "acme",
			repo: "widgets",
			cloneUrl: "https://github.com/acme/widgets.git",
			subdirectory: "packages/core",
			branch: "main",
		},
	);
});

Deno.test("parseGithubInput rejects bad URL", () => {
	assertThrows(
		() => parseGithubInput("not a github ref"),
		Error,
		"Unrecognized GitHub input",
	);
});

Deno.test("syncProject materializes subdir and upserts registry offline", async () => {
	const tmp = await Deno.makeTempDir({ prefix: "devshell-project-sync-" });
	const dataRoot = join(tmp, "data");
	const lines: string[] = [];

	try {
		assertEquals(listCachedRepos(dataRoot), []);

		await seedLocalClone(dataRoot, "acme", "widgets", {
			"README.md": "root\n",
			"apps/web/package.json": '{"name":"web"}\n',
			"apps/web/index.ts": "export {}\n",
		});

		const first = await syncProject(
			"acme/widgets",
			"apps/web",
			dataRoot,
			(line) => lines.push(line),
		);

		assertEquals(first.action, "pulled");
		assertEquals(
			first.workDir,
			join(dataRoot, "work", "acme__widgets__apps__web"),
		);
		assertEquals(
			Deno.readTextFileSync(join(first.workDir, "package.json")),
			'{"name":"web"}\n',
		);
		assertEquals(existsSync(join(first.workDir, "README.md")), false);

		const cached = listCachedRepos(dataRoot);
		assertEquals(cached.length, 1);
		assertEquals(cached[0].id, "acme__widgets");
		assertEquals(cached[0].cloneUrl, "https://github.com/acme/widgets.git");
		assertEquals(cached[0].branch, "main");
		assertEquals(cached[0].localPath, join(dataRoot, "clones", "acme__widgets"));
		assertEquals(cached[0].lastError, undefined);
		assertEquals(first.repos, cached);

		const before = cached[0].lastSyncedAt;
		await new Promise((r) => setTimeout(r, 5));

		const second = await syncProject(
			"https://github.com/acme/widgets",
			"apps/web",
			dataRoot,
			(line) => lines.push(line),
		);
		assertEquals(second.action, "pulled");
		assertEquals(second.repos.length, 1);
		assertEquals(second.repos[0].id, "acme__widgets");
		assertEquals(
			second.repos[0].lastSyncedAt >= before,
			true,
		);
		assertEquals(listCachedRepos(dataRoot).length, 1);
	} finally {
		try {
			Deno.removeSync(tmp, { recursive: true });
		} catch (err) {
			if (!(err instanceof Deno.errors.NotFound)) throw err;
		}
	}
});

Deno.test("syncProject throws when subdirectory missing", async () => {
	const tmp = await Deno.makeTempDir({ prefix: "devshell-project-sync-" });
	const dataRoot = join(tmp, "data");

	try {
		await seedLocalClone(dataRoot, "acme", "widgets", {
			"README.md": "root\n",
		});

		await assertRejects(
			() =>
				syncProject("acme/widgets", "apps/missing", dataRoot, () => {}),
			Error,
			"Subdirectory not found",
		);
	} finally {
		try {
			Deno.removeSync(tmp, { recursive: true });
		} catch (err) {
			if (!(err instanceof Deno.errors.NotFound)) throw err;
		}
	}
});
