import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as archiveRun, initProgress, readBranch } from "./archive.js";
import { writePrd } from "./prd.js";

describe("readBranch", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "ralph-archive-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	test("reads branch from prd.json", async () => {
		const prdPath = join(tempDir, "prd.json");
		await writePrd(prdPath, {
			project: "Test",
			branchName: "ralph/my-feature",
			description: "Test",
			userStories: [],
		});

		const branch = await readBranch(prdPath);
		expect(branch).toBe("ralph/my-feature");
	});

	test("returns empty string for missing file", async () => {
		const branch = await readBranch(join(tempDir, "nonexistent.json"));
		expect(branch).toBe("");
	});
});

describe("initProgress", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "ralph-progress-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	test("creates progress file with header", async () => {
		const path = join(tempDir, "progress.txt");
		await initProgress(path);

		const content = await Bun.file(path).text();
		expect(content).toContain("# Ralph Progress Log");
		expect(content).toContain("Started:");
		expect(content).toContain("---");
	});
});

describe("archiveRun", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "ralph-archive-run-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	test("archives when branch changes", async () => {
		const prdPath = join(tempDir, "prd.json");
		const lastBranchPath = join(tempDir, ".last-branch");
		const progressPath = join(tempDir, "progress.txt");
		const archiveDir = join(tempDir, "archive");

		// Create current PRD with new branch
		await writePrd(prdPath, {
			project: "Test",
			branchName: "ralph/new-feature",
			description: "New feature",
			userStories: [],
		});

		// Create last branch file with old branch
		await Bun.write(lastBranchPath, "ralph/old-feature");

		// Create progress file
		await Bun.write(progressPath, "Some progress content");

		await archiveRun(prdPath, lastBranchPath, progressPath, archiveDir);

		// Check that archive was created
		const archiveEntries = await readdir(archiveDir);
		expect(archiveEntries.length).toBe(1);
		expect(archiveEntries[0]).toContain("old-feature");

		// Check archived files
		const firstEntry = archiveEntries[0] ?? "";
		const archiveFolder = join(archiveDir, firstEntry);
		const archivedPrd = await Bun.file(join(archiveFolder, "prd.json")).text();
		expect(archivedPrd).toContain("ralph/new-feature");
	});

	test("does nothing when branch is the same", async () => {
		const prdPath = join(tempDir, "prd.json");
		const lastBranchPath = join(tempDir, ".last-branch");
		const progressPath = join(tempDir, "progress.txt");
		const archiveDir = join(tempDir, "archive");

		await writePrd(prdPath, {
			project: "Test",
			branchName: "ralph/same-branch",
			description: "Test",
			userStories: [],
		});
		await Bun.write(lastBranchPath, "ralph/same-branch");

		await archiveRun(prdPath, lastBranchPath, progressPath, archiveDir);

		// Archive dir should not exist
		expect(await Bun.file(archiveDir).exists()).toBe(false);
	});

	test("does nothing when files are missing", async () => {
		await archiveRun(
			join(tempDir, "nope.json"),
			join(tempDir, "nope.txt"),
			join(tempDir, "nope2.txt"),
			join(tempDir, "archive"),
		);
		// Should not throw
	});
});
