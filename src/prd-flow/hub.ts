/**
 * PRD Hub — interactive menu for reading, discussing, and launching a PRD.
 * Shown when `ralph prd` is run with no args and a prd.json exists.
 */
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { PRD } from "../core/prd.js";
import { readPrd } from "../core/prd.js";
import { readSession } from "../core/session.js";
import { renderMarkdown } from "../tui/markdown.js";
import { agentQuery } from "./claude/agent.js";
import { runOpenQuestions } from "./phases/open-questions.js";

/** Convert a PRD struct into readable markdown. */
export function prdToMarkdown(prd: PRD): string {
	const done = prd.userStories.filter((s) => s.passes).length;
	const total = prd.userStories.length;

	const lines: string[] = [
		`# ${prd.project}`,
		"",
		prd.description,
		"",
		`**Branch:** \`${prd.branchName}\`  `,
		`**Progress:** ${done}/${total} stories complete`,
		"",
		"---",
		"",
		"## User Stories",
		"",
	];

	for (const story of prd.userStories) {
		const check = story.passes ? "x" : " ";
		lines.push(`### [${check}] ${story.id} — ${story.title} (P${story.priority})`);
		lines.push("");
		lines.push(story.description);
		lines.push("");

		if (story.acceptanceCriteria.length > 0) {
			lines.push("**Acceptance Criteria:**");
			for (const ac of story.acceptanceCriteria) {
				lines.push(`- ${ac}`);
			}
			lines.push("");
		}

		if (story.notes) {
			lines.push(`**Notes:** ${story.notes}`);
			lines.push("");
		}
	}

	return lines.join("\n");
}

type HubAction = "read" | "open_questions" | "talk" | "reread" | "run" | "quit";

export interface RunSettings {
	maxIterations: number;
	reviewPasses: number;
	team: boolean;
}

/** Prompt user for run configuration. Returns null on cancel. */
export async function promptRunSettings(): Promise<RunSettings | null> {
	const iterations = await p.text({
		message: "Max iterations",
		placeholder: "10",
		defaultValue: "10",
		validate: (v) => {
			const n = Number.parseInt(v, 10);
			if (Number.isNaN(n) || n <= 0) return "Must be a positive integer";
		},
	});
	if (p.isCancel(iterations)) return null;

	const reviewPasses = await p.text({
		message: "Review passes after implementation",
		placeholder: "0",
		defaultValue: "0",
		validate: (v) => {
			const n = Number.parseInt(v, 10);
			if (Number.isNaN(n) || n < 0) return "Must be a non-negative integer";
		},
	});
	if (p.isCancel(reviewPasses)) return null;

	const team = await p.confirm({
		message: "Enable team mode?",
		initialValue: false,
	});
	if (p.isCancel(team)) return null;

	return {
		maxIterations: Number.parseInt(String(iterations), 10),
		reviewPasses: Number.parseInt(String(reviewPasses), 10),
		team: Boolean(team),
	};
}

/** Main hub loop. */
export async function prdHub(prd: PRD, prdPath: string, baseDir: string): Promise<void> {
	p.intro(`Ralph PRD Hub — ${prd.project}`);

	let currentPrd = prd;

	while (true) {
		// Build options dynamically
		const options: { value: HubAction; label: string; hint: string }[] = [
			{ value: "read", label: "Read PRD", hint: "render in terminal" },
		];

		// Check for unresolved open questions
		const sessionPath = join(baseDir, "prd-session.json");
		try {
			const session = await readSession(sessionPath);
			const unresolved = session.phases.open_questions.questions.filter((q) => !q.resolved);
			if (unresolved.length > 0) {
				options.push({
					value: "open_questions",
					label: "Open questions",
					hint: `${unresolved.length} unresolved`,
				});
			}
		} catch {
			// No session file, skip
		}

		options.push(
			{ value: "talk", label: "Talk to Claude", hint: "free-form chat with PRD context" },
			{ value: "reread", label: "Re-read PRD", hint: "reload from disk after external edits" },
			{ value: "run", label: "Run", hint: "configure and start execution" },
			{ value: "quit", label: "Quit", hint: "" },
		);

		const action = await p.select({
			message: "What would you like to do?",
			options,
		});

		if (p.isCancel(action)) break;

		const choice = action as HubAction;

		switch (choice) {
			case "read": {
				const md = prdToMarkdown(currentPrd);
				console.log(renderMarkdown(md));
				break;
			}

			case "open_questions": {
				try {
					const session = await readSession(sessionPath);
					const questions = session.phases.open_questions.questions;
					await runOpenQuestions(session, questions, sessionPath);
				} catch (err) {
					p.log.error(`Failed to load session: ${err}`);
				}
				break;
			}

			case "talk": {
				p.log.info("Chat with Claude about your PRD. Type /done to return to menu.\n");
				const prdContext = prdToMarkdown(currentPrd);
				const history: string[] = [];

				while (true) {
					const input = await p.text({
						message: ">",
						placeholder: "Ask about your PRD, or /done to return",
					});

					if (p.isCancel(input) || String(input).trim() === "/done") {
						break;
					}

					const userMsg = String(input).trim();
					history.push(`User: ${userMsg}`);

					const prompt =
						history.length === 1
							? `The user wants to discuss their PRD.\n\nPRD:\n${prdContext}\n\nUser: ${userMsg}`
							: `Conversation so far:\n${history.join("\n")}\n\nRespond helpfully and concisely.`;

					const result = await agentQuery({
						prompt,
						systemPrompt:
							"You are a helpful product manager assistant. The user has a PRD and wants to discuss it. Be concise and actionable.",
						session: {
							id: "",
							description: "",
							createdAt: "",
							updatedAt: "",
							model: "claude-sonnet-4-6",
							currentPhase: "review",
							phases: {
								research: { status: "complete" },
								interview: { status: "complete", questions: [] },
								draft: { status: "complete" },
								open_questions: { status: "complete", questions: [] },
								review: { status: "complete" },
								convert: { status: "complete" },
							},
						},
						maxTurns: 1,
						streaming: true,
					});

					history.push(`Claude: ${result.text.trim()}`);
					console.log(); // newline after streamed response
				}
				break;
			}

			case "reread": {
				try {
					currentPrd = await readPrd(prdPath);
					p.log.success("PRD reloaded from disk");
				} catch (err) {
					p.log.error(`Failed to re-read PRD: ${err}`);
				}
				break;
			}

			case "run": {
				const settings = await promptRunSettings();
				if (!settings) {
					p.log.warn("Run cancelled");
					break;
				}

				// Archive setup + run
				const { run: archiveRun, initProgress, readBranch } = await import("../core/archive.js");
				const { dirname } = await import("node:path");
				const prdFile = prdPath;
				const prdDir = dirname(prdFile);
				const progressFile = join(prdDir, "progress.txt");
				const archiveDir = join(prdDir, "archive");
				const lastBranchFile = join(prdDir, ".last-branch");

				await archiveRun(prdFile, lastBranchFile, progressFile, archiveDir);

				const branch = await readBranch(prdFile);
				if (branch) {
					await Bun.write(lastBranchFile, branch);
				}

				if (!(await Bun.file(progressFile).exists())) {
					await initProgress(progressFile);
				}

				const { runCommand } = await import("../commands/run.js");
				const { resolvePaths } = await import("../core/config.js");
				const paths = await resolvePaths();
				await runCommand({
					tool: "claude",
					prdFile,
					promptDir: paths.promptDir,
					repoRoot: paths.repoRoot,
					maxIterations: settings.maxIterations,
					team: settings.team,
					reviewDefault: settings.reviewPasses,
				});
				return; // exit hub after run
			}

			case "quit": {
				p.outro("Bye!");
				return;
			}
		}
	}

	// Ctrl+C / cancel
	p.outro("Bye!");
}
