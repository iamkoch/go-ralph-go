import { appendFile } from "node:fs/promises";
import {
	type PRD,
	type Story,
	allComplete,
	effectiveReviewPasses,
	nextIncompleteStory,
	nextReviewStory,
	readPrd,
} from "../core/prd.js";
import type { Tool } from "../core/types.js";
import { run as runSubprocess } from "../runner/subprocess.js";
import { renderCompact } from "./status.js";
import { createSpinner } from "../tui/spinner.js";
import { dim, fail, header, success } from "../tui/styles.js";
import { ImplementationWords, ReviewWords } from "../tui/words.js";

const MAX_DISPLAY_LINES = 15;

export interface RunOptions {
	tool: Tool;
	/** Absolute path to prd.json. */
	prdFile: string;
	/** Directory containing CLAUDE.md / prompt.md for the agent prompt. */
	promptDir: string;
	/** Repository root — subprocess CWD. */
	repoRoot: string;
	maxIterations: number;
	team: boolean;
	reviewDefault: number;
	debugFile?: string;
}

function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return `${s.slice(0, maxLen - 3)}...`;
}

function buildReviewPreamble(story: Story, totalPasses: number): string {
	return `## REVIEW MODE — Story ${story.id}: ${story.title}

This is review pass ${(story.reviewsCompleted ?? 0) + 1} of ${totalPasses}. The story has already been implemented.

Your task:
1. Read the code changes for this story (check recent git commits)
2. Assess: code quality, edge cases, error handling, test coverage
3. Check that acceptance criteria are truly met
4. Fix any issues you find — commit fixes with message: review: [${story.id}] - [description]
5. Update prd.json: increment reviewsCompleted for this story
6. If this is the final review pass and everything looks good, output <promise>REVIEW_COMPLETE</promise>`;
}

export async function runCommand(opts: RunOptions): Promise<void> {
	if (opts.debugFile) {
		await Bun.write(opts.debugFile, "");
		console.error(`Debug output: ${opts.debugFile}`);
	}

	const { spinner, startWordRotation } = createSpinner();

	for (let iteration = 1; iteration <= opts.maxIterations; iteration++) {
		// Re-read PRD each iteration to get latest state
		let prd: PRD | null = null;
		try {
			prd = await readPrd(opts.prdFile);
		} catch {
			// No PRD yet, continue anyway
		}

		// Check if everything is already done
		if (prd && allComplete(prd, opts.reviewDefault)) {
			spinner.stop();
			console.log(success("Ralph completed all tasks!"));
			return;
		}

		// Determine what to work on
		let reviewMode = false;
		let reviewInfo = "";
		let reviewPreamble: string | undefined;
		let storyId = "";
		let storyTitle = "";

		if (prd) {
			let story: Story | null = nextIncompleteStory(prd);
			if (!story) {
				story = nextReviewStory(prd, opts.reviewDefault);
				if (story) {
					const eff = effectiveReviewPasses(story, opts.reviewDefault);
					reviewMode = true;
					reviewInfo = `Review ${(story.reviewsCompleted ?? 0) + 1}/${eff} for ${story.id}`;
					reviewPreamble = buildReviewPreamble(story, eff);
				}
			}
			if (story) {
				storyId = story.id;
				storyTitle = story.title;
			}
		}

		// Update spinner text with current iteration info
		const words = reviewMode ? ReviewWords : ImplementationWords;
		const stopRotation = startWordRotation(words);

		const storyCtx = storyId ? ` — ${storyId}: ${truncate(storyTitle, 40)}` : "";
		const iterLine = reviewMode
			? `${reviewInfo}: ${truncate(storyTitle, 40)} (${opts.tool})`
			: `Ralph — Iteration ${iteration}/${opts.maxIterations}${storyCtx} (${opts.tool})`;

		const storyList = prd ? `\n${renderCompact(prd)}\n` : "";
		spinner.prefixText = `${storyList}${header(iterLine)}`;
		spinner.start();

		if (opts.debugFile) {
			await appendFile(
				opts.debugFile,
				`\n=== Iteration ${iteration}/${opts.maxIterations} — ${storyId}: ${storyTitle} ===\n\n`,
			);
		}

		// Run the subprocess
		const { lines, exitCode } = await runSubprocess({
			tool: opts.tool,
			promptDir: opts.promptDir,
			repoRoot: opts.repoRoot,
			team: opts.team,
			reviewPreamble,
		});

		// Stream output, keeping last N lines for display
		const allOutput: string[] = [];
		const displayLines: string[] = [];

		for await (const line of lines) {
			allOutput.push(line);
			displayLines.push(line);
			if (displayLines.length > MAX_DISPLAY_LINES) {
				displayLines.shift();
			}

			// Update spinner suffix with trailing output
			spinner.suffixText = `\n${dim(displayLines.join("\n"))}`;

			if (opts.debugFile) {
				await appendFile(opts.debugFile, `${line}\n`);
			}
		}

		stopRotation();
		spinner.suffixText = "";

		await exitCode;
		const output = allOutput.join("\n");

		// Check for completion signals
		if (output.includes("<promise>COMPLETE</promise>")) {
			try {
				const freshPrd = await readPrd(opts.prdFile);
				if (allComplete(freshPrd, opts.reviewDefault)) {
					spinner.stop();
					console.log(success("Ralph completed all tasks!"));
					return;
				}
			} catch {
				// PRD read failed, treat as complete
				spinner.stop();
				console.log(success("Ralph completed all tasks!"));
				return;
			}
		}

		// If we've exhausted iterations
		if (iteration >= opts.maxIterations) {
			spinner.stop();
			console.log(
				fail(`Ralph reached max iterations (${opts.maxIterations}) without completing all tasks.`),
			);
			process.exit(1);
		}

		// Stop spinner briefly between iterations so the new prefix renders clean
		spinner.stop();
	}

	// Should not reach here, but just in case
	spinner.stop();
	console.log(
		fail(`Ralph reached max iterations (${opts.maxIterations}) without completing all tasks.`),
	);
	process.exit(1);
}
