/**
 * Phase 2: Interview — Claude generates structured questions, user answers via prompts.
 */
import * as p from "@clack/prompts";
import ora from "ora";
import type { InterviewQuestion, PrdSession } from "../../core/session.js";
import { breakoutDiscussion } from "../breakout.js";
import { agentQuery } from "../claude/agent.js";
import { buildInterviewPrompt } from "../claude/prompts.js";
import { TOOL_NAMES, onInterviewOutput, prdToolsServer } from "../claude/tools.js";

export async function runInterview(
	session: PrdSession,
	research: string,
): Promise<InterviewQuestion[]> {
	const spinner = ora({ text: "Generating interview questions...", color: "cyan" }).start();

	// Set up callback to capture structured output
	let capturedQuestions: InterviewQuestion[] = [];
	onInterviewOutput((data) => {
		capturedQuestions = data.questions.map((q) => ({
			text: q.text,
			options: q.options,
			discussionUsed: false,
		}));
	});

	const prompt = buildInterviewPrompt(session.description, research);

	await agentQuery({
		prompt: `Research findings:\n${research}\n\nFeature: ${session.description}\n\nGenerate interview questions by calling the generate_interview tool.`,
		systemPrompt: prompt,
		session,
		mcpServers: { "ralph-prd-tools": prdToolsServer },
		allowedTools: [TOOL_NAMES.interview],
		maxTurns: 3,
	});

	spinner.succeed(`Generated ${capturedQuestions.length} questions`);

	// Now present each question to the user
	const answeredQuestions: InterviewQuestion[] = [];

	for (const question of capturedQuestions) {
		const options = [
			...question.options.map((opt) => ({ value: opt, label: opt })),
			{ value: "__discuss__", label: "? Discuss with Claude" },
		];

		const answer = await p.select({
			message: question.text,
			options,
		});

		if (p.isCancel(answer)) {
			p.log.warn("Interview cancelled");
			return answeredQuestions;
		}

		if (answer === "__discuss__") {
			const { resolution, discussed } = await breakoutDiscussion(
				question.text,
				`Options were: ${question.options.join(", ")}`,
				session,
			);
			answeredQuestions.push({
				...question,
				answer: resolution || question.options[0] || "",
				discussionUsed: discussed,
			});
		} else {
			answeredQuestions.push({
				...question,
				answer: String(answer),
				discussionUsed: false,
			});
		}
	}

	return answeredQuestions;
}
