import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readPrd } from "./prd.js";

export async function run(
	prdFile: string,
	lastBranchFile: string,
	progressFile: string,
	archiveDir: string,
): Promise<void> {
	const prdExists = await Bun.file(prdFile).exists();
	if (!prdExists) return;

	const lastBranchExists = await Bun.file(lastBranchFile).exists();
	if (!lastBranchExists) return;

	const currentBranch = await readBranch(prdFile);
	const lastBranch = (await Bun.file(lastBranchFile).text()).trim();

	if (!currentBranch || !lastBranch || currentBranch === lastBranch) {
		return;
	}

	const date = new Date().toISOString().slice(0, 10);
	const folderName = lastBranch.replace(/^ralph\//, "");
	const archiveFolder = join(archiveDir, `${date}-${folderName}`);

	console.log(`Archiving previous run: ${lastBranch}`);
	await mkdir(archiveFolder, { recursive: true });

	await copyFile(prdFile, join(archiveFolder, "prd.json"));
	await copyFile(progressFile, join(archiveFolder, "progress.txt"));
	console.log(`   Archived to: ${archiveFolder}`);

	await initProgress(progressFile);
}

export async function readBranch(prdFile: string): Promise<string> {
	try {
		const prd = await readPrd(prdFile);
		return prd.branchName;
	} catch {
		return "";
	}
}

export async function initProgress(path: string): Promise<void> {
	const content = `# Ralph Progress Log\nStarted: ${new Date().toString()}\n---\n`;
	await Bun.write(path, content);
}

async function copyFile(src: string, dst: string): Promise<void> {
	try {
		const data = await Bun.file(src).arrayBuffer();
		await Bun.write(dst, data);
	} catch {
		// Silently ignore copy errors, matching Go behavior
	}
}
