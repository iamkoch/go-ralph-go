/**
 * Phase 5: Review — display final PRD, allow edits, get approval.
 */
import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import type { PrdSession } from "../../core/session.js";
import { renderMarkdown } from "../../tui/markdown.js";
import { agentQuery } from "../claude/agent.js";
import { REVIEW_PROMPT } from "../claude/prompts.js";
import { TOOL_NAMES, onPrdOutput, prdToolsServer } from "../claude/tools.js";

export async function runReview(
	session: PrdSession,
	markdown: string,
): Promise<{ approved: boolean; markdown: string }> {
	let currentMarkdown = markdown;

	while (true) {
		// Render PRD in terminal
		console.log(`\n${renderMarkdown(currentMarkdown)}`);

		const action = await p.select({
			message: "What would you like to do?",
			options: [
				{ value: "approve", label: "Approve — proceed to conversion" },
				{ value: "edit", label: "Open in $EDITOR" },
				{ value: "feedback", label: "Give feedback to Claude" },
				{ value: "cancel", label: "Cancel" },
			],
		});

		if (p.isCancel(action) || action === "cancel") {
			return { approved: false, markdown: currentMarkdown };
		}

		if (action === "approve") {
			return { approved: true, markdown: currentMarkdown };
		}

		if (action === "edit") {
			const editor = process.env.EDITOR || "vim";
			const filePath = session.phases.draft.prdFilePath;
			if (filePath) {
				try {
					execSync(`${editor} ${filePath}`, { stdio: "inherit" });
					currentMarkdown = await Bun.file(filePath).text();
				} catch {
					p.log.error("Editor failed. You can also use the feedback option.");
				}
			} else {
				p.log.error("No PRD file path available. Use feedback instead.");
			}
		}

		if (action === "feedback") {
			const feedback = await p.text({
				message: "What changes would you like?",
				placeholder: "e.g., Split US-003 into two stories, add error handling criteria...",
			});

			if (p.isCancel(feedback)) continue;

			const spinner = p.spinner();
			spinner.start("Claude is revising the PRD...");

			let revisedMarkdown = currentMarkdown;
			onPrdOutput((data) => {
				revisedMarkdown = data.markdown;
			});

			await agentQuery({
				prompt: `The user wants these changes to the PRD:\n\n${String(feedback)}\n\nCurrent PRD:\n\n${currentMarkdown}\n\nRevise the PRD and call generate_prd with the updated version.`,
				systemPrompt: REVIEW_PROMPT,
				session,
				mcpServers: { "ralph-prd-tools": prdToolsServer },
				allowedTools: [TOOL_NAMES.prd],
				maxTurns: 3,
			});

			currentMarkdown = revisedMarkdown;

			// Update file on disk
			const filePath = session.phases.draft.prdFilePath;
			if (filePath) {
				await Bun.write(filePath, currentMarkdown);
			}

			spinner.stop("PRD revised");
		}
	}
}
