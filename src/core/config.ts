import { dirname, join } from "node:path";

export interface ResolvedPaths {
	/** Repository root (CWD) — where the agent subprocess runs. */
	repoRoot: string;
	/** Absolute path to prd.json, or null if not found. */
	prdFile: string | null;
	/** Directory containing CLAUDE.md/prompt.md for the agent prompt. */
	promptDir: string;
}

const IGNORE_PATTERN = /\/(node_modules|\.git|archive|dist)\//;

/** Search well-known locations then glob for a file. */
async function findFile(
	repoRoot: string,
	filename: string,
	wellKnownDirs: string[],
): Promise<string | null> {
	// Fast path: check well-known locations
	for (const dir of wellKnownDirs) {
		const candidate = join(dir, filename);
		if (await Bun.file(candidate).exists()) return candidate;
	}

	// Recursive glob
	const { Glob } = await import("bun");
	const glob = new Glob(`**/${filename}`);
	for await (const match of glob.scan({
		cwd: repoRoot,
		absolute: true,
		onlyFiles: true,
		followSymlinks: false,
	})) {
		if (IGNORE_PATTERN.test(match)) continue;
		return match;
	}

	return null;
}

export async function resolvePaths(): Promise<ResolvedPaths> {
	const repoRoot = process.cwd();

	const wellKnown = [
		repoRoot,
		join(repoRoot, "scripts", "ralph"),
		join(repoRoot, "ralph"),
	];

	// Find prd.json
	const prdFile = await findFile(repoRoot, "prd.json", wellKnown);

	// Find prompt dir (CLAUDE.md or prompt.md for the agent)
	// Prefer scripts/ralph/ since that's where `ralph install` puts them
	let promptDir = repoRoot;
	for (const dir of [join(repoRoot, "scripts", "ralph"), repoRoot]) {
		for (const name of ["CLAUDE.md", "prompt.md"]) {
			if (await Bun.file(join(dir, name)).exists()) {
				promptDir = dir;
				break;
			}
		}
		if (promptDir !== repoRoot) break;
	}

	return { repoRoot, prdFile, promptDir };
}

/** @deprecated Use resolvePaths() instead. */
export async function resolveBaseDir(): Promise<string> {
	const { prdFile, repoRoot } = await resolvePaths();
	return prdFile ? dirname(prdFile) : repoRoot;
}
