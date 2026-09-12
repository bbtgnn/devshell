export type GitStatus = {
	branch: string;
	dirty: boolean;
	ahead: number;
	behind: number;
	head: string;
	remote: string;
};

export function getApiBase(): string | null {
	return Deno.env.get("DEVSHELL_API")?.trim() || null;
}

export async function getGitStatus(): Promise<GitStatus | null> {
	const base = getApiBase();
	if (!base) return null;
	const res = await fetch(new URL("/api/git", base));
	if (!res.ok) return null;
	return (await res.json()) as GitStatus;
}

export async function openPreview(path: string): Promise<boolean> {
	const base = getApiBase();
	if (!base) return false;
	const res = await fetch(new URL("/api/open-preview", base), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ path }),
	});
	return res.ok;
}
