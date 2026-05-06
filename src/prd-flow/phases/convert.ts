/**
 * Phase 6: Convert — generate prd.json from the approved PRD.
 */
import * as p from "@clack/prompts";
import type { PRD } from "../../core/prd.js";
import type { PrdSession } from "../../core/session.js";
import { agentQuery } from "../claude/agent.js";
import { buildConvertPrompt } from "../claude/prompts.js";
import { TOOL_NAMES, onPrdJsonOutput, prdToolsServer } from "../claude/tools.js";

export async function runConvert(
	session: PrdSession,
	markdown: string,
	outputPath: string,
): Promise<PRD | null> {
	const spinner = p.spinner();
	spinner.start("Converting PRD to prd.json...");

	let capturedPrd: PRD | null = null;

	onPrdJsonOutput((data) => {
		capturedPrd = {
			project: data.project,
			branchName: data.branchName,
			description: data.description,
			userStories: data.userStories.map((s) => ({
				id: s.id,
				title: s.title,
				description: s.description,
				acceptanceCriteria: s.acceptanceCriteria,
				priority: s.priority,
				passes: false,
				notes: s.notes || "",
			})),
		};
	});

	const systemPrompt = buildConvertPrompt(markdown);

	await agentQuery({
		prompt: `Convert this PRD to prd.json format by calling the generate_prd_json tool.\n\n${markdown}`,
		systemPrompt,
		session,
		mcpServers: { "ralph-prd-tools": prdToolsServer },
		allowedTools: [TOOL_NAMES.prdJson],
		maxTurns: 3,
	});

	if (!capturedPrd) {
		spinner.stop("Failed to generate prd.json");
		p.log.error("Claude did not produce a valid prd.json. Please try again.");
		return null;
	}

	// Write prd.json
	const json = `${JSON.stringify(capturedPrd, null, "  ")}\n`;
	await Bun.write(outputPath, json);

	spinner.stop(`prd.json written to ${outputPath}`);

	// Show summary
	const prd = capturedPrd as PRD;
	p.log.info(`Project: ${prd.project}`);
	p.log.info(`Branch: ${prd.branchName}`);
	p.log.info(`Stories: ${prd.userStories.length}`);

	for (const story of prd.userStories) {
		p.log.step(`  ${story.id}: ${story.title} (P${story.priority})`);
	}

	return capturedPrd;
}
