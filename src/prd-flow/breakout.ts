/**
 * "Break out to discuss" free-form chat handler.
 * Used in interview and open-questions phases when the user wants
 * to discuss a question with Claude before answering.
 */
import * as p from "@clack/prompts";
import type { PrdSession } from "../core/session.js";
import { agentQuery } from "./claude/agent.js";
import { OPEN_QUESTIONS_PROMPT } from "./claude/prompts.js";

export interface BreakoutResult {
	/** The final resolution from the discussion */
	resolution: string;
	/** Whether the user actually engaged in discussion */
	discussed: boolean;
}

/**
 * Run a free-form discussion with Claude about a specific question.
 * The user types messages, Claude responds, until /done is typed.
 * Returns the resolution derived from the conversation.
 */
export async function breakoutDiscussion(
	question: string,
	context: string,
	session: PrdSession,
): Promise<BreakoutResult> {
	p.log.info("Discussing with Claude. Type your thoughts, or /done to finish.\n");

	const conversationHistory: string[] = [];

	while (true) {
		const userInput = await p.text({
			message: ">",
			placeholder: "Type your thoughts, or /done to finish",
		});

		if (p.isCancel(userInput)) {
			return { resolution: "", discussed: conversationHistory.length > 0 };
		}

		const input = String(userInput).trim();

		if (input === "/done") {
			if (conversationHistory.length === 0) {
				return { resolution: "", discussed: false };
			}

			// Ask Claude to summarize the resolution
			const summary = await agentQuery({
				prompt: `Based on our discussion about "${question}", summarize the resolution in 1-2 sentences. Discussion:\n${conversationHistory.join("\n")}`,
				systemPrompt: OPEN_QUESTIONS_PROMPT,
				session,
				maxTurns: 1,
			});

			return { resolution: summary.text.trim(), discussed: true };
		}

		conversationHistory.push(`User: ${input}`);

		const prompt = `The user is discussing this question: "${question}"\n\nContext: ${context}\n\nConversation so far:\n${conversationHistory.join("\n")}\n\nRespond helpfully and concisely.`;

		const result = await agentQuery({
			prompt,
			systemPrompt: OPEN_QUESTIONS_PROMPT,
			session,
			maxTurns: 1,
			streaming: true,
		});

		conversationHistory.push(`Claude: ${result.text.trim()}`);
		console.log(); // newline after streamed response
	}
}
