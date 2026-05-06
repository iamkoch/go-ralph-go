/**
 * Phase 3: Draft — Claude generates the PRD markdown.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import ora from "ora";
import type { InterviewQuestion, PrdSession } from "../../core/session.js";
import type { OpenQuestion } from "../../core/session.js";
import { agentQuery } from "../claude/agent.js";
import { buildDraftPrompt } from "../claude/prompts.js";
import { TOOL_NAMES, onPrdOutput, prdToolsServer } from "../claude/tools.js";

interface DraftResult {
	markdown: string;
	openQuestions: OpenQuestion[];
	filePath: string;
}

function formatInterviewSummary(questions: InterviewQuestion[]): string {
	return questions
		.map((q) => {
			const method = q.discussionUsed ? " (discussed)" : "";
			return `Q: ${q.text}\nA: ${q.answer}${method}`;
		})
		.join("\n\n");
}

export async function runDraft(
	session: PrdSession,
	research: string,
	questions: InterviewQuestion[],
): Promise<DraftResult> {
	const spinner = ora({ text: "Drafting PRD...", color: "cyan" }).start();

	let capturedMarkdown = "";
	let capturedOpenQuestions: OpenQuestion[] = [];

	onPrdOutput((data) => {
		capturedMarkdown = data.markdown;
		capturedOpenQuestions = data.openQuestions.map((q) => ({
			text: q.text,
			resolved: false,
			resolution: null,
		}));
	});

	const interviewSummary = formatInterviewSummary(questions);
	const systemPrompt = buildDraftPrompt(session.description, research, interviewSummary);

	await agentQuery({
		prompt: `Create the PRD by calling the generate_prd tool.\n\nFeature: ${session.description}\n\nResearch:\n${research}\n\nInterview answers:\n${interviewSummary}`,
		systemPrompt,
		session,
		mcpServers: { "ralph-prd-tools": prdToolsServer },
		allowedTools: [TOOL_NAMES.prd],
		maxTurns: 3,
	});

	// Save markdown to file
	const kebabName = session.description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const filePath = `tasks/prd-${kebabName}.md`;

	await mkdir(dirname(filePath), { recursive: true });
	await Bun.write(filePath, capturedMarkdown);

	spinner.succeed(`PRD drafted: ${filePath}`);

	return {
		markdown: capturedMarkdown,
		openQuestions: capturedOpenQuestions,
		filePath,
	};
}
