#!/usr/bin/env bun
import { dirname, join } from "node:path";
import { Command } from "commander";
import { installCommand } from "./commands/install.js";
import { prdCommand } from "./commands/prd.js";
import { runCommand } from "./commands/run.js";
import { confirm, render, statusCommand } from "./commands/status.js";
import { run as archiveRun, initProgress, readBranch } from "./core/archive.js";
import { resolvePaths } from "./core/config.js";
import { allComplete, readPrd } from "./core/prd.js";
import type { Tool } from "./core/types.js";

const program = new Command();

program.name("ralph").description("Ralph Wiggum - Long-running AI agent loop").version("1.0.0");

// Default command: ralph [options] [max_iterations]
program
	.argument("[max_iterations]", "Maximum number of iterations", "10")
	.option("--tool <tool>", "AI tool to use: claude or amp", "claude")
	.option("--team", "Enable agent team mode", false)
	.option("--debug", "Write raw tool output to ralph-debug.log", false)
	.option("--review-passes <n>", "Number of review passes after implementation", "0")
	.option("-y, --yes", "Skip confirmation prompt", false)
	.action(async (maxIterationsStr: string, options) => {
		const tool = options.tool as Tool;
		if (tool !== "amp" && tool !== "claude") {
			console.error(`Error: Invalid tool '${tool}'. Must be 'amp' or 'claude'.`);
			process.exit(1);
		}

		const maxIterations = Number.parseInt(maxIterationsStr, 10);
		if (Number.isNaN(maxIterations) || maxIterations <= 0) {
			console.error(`Error: max_iterations must be a positive integer, got '${maxIterationsStr}'.`);
			process.exit(1);
		}

		const reviewDefault = Number.parseInt(options.reviewPasses, 10);
		const paths = await resolvePaths();

		if (!paths.prdFile) {
			console.error("Error: No prd.json found. Run `ralph prd` to create one.");
			process.exit(1);
		}

		const prdDir = dirname(paths.prdFile);
		const progressFile = join(prdDir, "progress.txt");
		const archiveDir = join(prdDir, "archive");
		const lastBranchFile = join(prdDir, ".last-branch");

		// Archive previous run if branch changed
		await archiveRun(paths.prdFile, lastBranchFile, progressFile, archiveDir);

		// Track current branch
		const branch = await readBranch(paths.prdFile);
		if (branch) {
			await Bun.write(lastBranchFile, branch);
		}

		// Initialize progress file if it doesn't exist
		if (!(await Bun.file(progressFile).exists())) {
			await initProgress(progressFile);
		}

		// Pre-run confirmation
		if (!options.yes) {
			try {
				const prd = await readPrd(paths.prdFile);
				if (allComplete(prd, reviewDefault)) {
					console.log(render(prd, reviewDefault));
					console.log("\nAll stories are complete!");
					return;
				}
				const proceed = await confirm(prd, reviewDefault, tool, maxIterations);
				if (!proceed) return;
			} catch {
				// No PRD yet, that's fine
			}
		}

		await runCommand({
			tool,
			prdFile: paths.prdFile,
			promptDir: paths.promptDir,
			repoRoot: paths.repoRoot,
			maxIterations,
			team: options.team,
			reviewDefault,
			debugFile: options.debug ? "ralph-debug.log" : undefined,
		});
	});

// Subcommand: ralph install
program
	.command("install")
	.description("Install Ralph template files in the current directory")
	.action(async () => {
		await installCommand();
	});

// Subcommand: ralph status
program
	.command("status")
	.description("Show PRD progress and next story")
	.option("--review-passes <n>", "Number of review passes", "0")
	.action(async (options) => {
		const paths = await resolvePaths();
		const reviewDefault = Number.parseInt(options.reviewPasses, 10);
		if (!paths.prdFile) {
			console.error("Error: No prd.json found. Run `ralph prd` to create one.");
			process.exit(1);
		}
		await statusCommand(paths.prdFile, reviewDefault);
	});

// Subcommand: ralph prd <description>
program
	.command("prd [description]")
	.description("Create a PRD interactively from a feature description")
	.option("--resume", "Resume a previous PRD session")
	.option("--restart", "Discard previous session and start fresh")
	.action(async (description: string | undefined, options) => {
		await prdCommand(description, options);
	});

program.parse();
