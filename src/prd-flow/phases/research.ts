/**
 * Phase 1: Research — Claude explores the codebase autonomously.
 */
import ora from "ora";
import type { PrdSession } from "../../core/session.js";
import { type AgentResult, agentStream } from "../claude/agent.js";
import { buildResearchPrompt } from "../claude/prompts.js";

export async function runResearch(session: PrdSession): Promise<string> {
	const spinner = ora({ text: "Researching codebase...", color: "cyan" }).start();

	const prompt = buildResearchPrompt(session.description);

	const stream = agentStream({
		prompt,
		systemPrompt: prompt,
		session,
		allowedTools: ["Read", "Glob", "Grep"],
		maxTurns: 10,
	});

	const chunks: string[] = [];

	let iterResult = await stream.next();
	while (!iterResult.done) {
		const chunk = iterResult.value;
		chunks.push(chunk);
		// Show last meaningful text in spinner
		const lines = chunk.split("\n");
		const last = lines[lines.length - 1];
		if (last?.trim()) {
			spinner.text = `Researching: ${last.trim().slice(0, 60)}`;
		}
		iterResult = await stream.next();
	}

	// iterResult.value is the AgentResult when done === true
	const result: AgentResult = iterResult.value;
	const findings = result.text || chunks.join("");

	if (result.sessionId) {
		session.claudeSessionId = result.sessionId;
	}

	spinner.succeed("Research complete");
	return findings;
}
