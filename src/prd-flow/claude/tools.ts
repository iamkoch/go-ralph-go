/**
 * Custom MCP tool definitions for structured outputs during PRD flow.
 * Each tool forces Claude to return structured JSON that we can validate.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// --- Schemas ---

const interviewQuestionSchema = z.object({
	text: z.string().describe("The question to ask the user"),
	options: z.array(z.string()).min(2).max(5).describe("Answer options (2-5 choices)"),
});

const interviewOutputSchema = z.object({
	questions: z
		.array(interviewQuestionSchema)
		.min(3)
		.max(7)
		.describe("3-7 clarifying questions with options"),
});

const openQuestionSchema = z.object({
	text: z.string().describe("An open question or ambiguity to resolve"),
});

const prdOutputSchema = z.object({
	markdown: z.string().describe("Full PRD in markdown format"),
	openQuestions: z.array(openQuestionSchema).describe("Unresolved questions or ambiguities"),
});

const userStorySchema = z.object({
	id: z.string().describe("Story ID like US-001"),
	title: z.string().describe("Short story title"),
	description: z.string().describe("User story description"),
	acceptanceCriteria: z.array(z.string()).describe("Verifiable acceptance criteria"),
	priority: z.number().int().positive().describe("Priority (1 = highest)"),
	passes: z.literal(false),
	notes: z.string().default(""),
});

const prdJsonOutputSchema = z.object({
	project: z.string().describe("Project name"),
	branchName: z.string().describe("Git branch name (ralph/feature-name)"),
	description: z.string().describe("Feature description"),
	userStories: z.array(userStorySchema).min(1),
});

// --- Tool handlers that capture output via callbacks ---

type ToolCallback<T> = (data: T) => void;

let interviewCallback: ToolCallback<z.infer<typeof interviewOutputSchema>> | null = null;
let prdCallback: ToolCallback<z.infer<typeof prdOutputSchema>> | null = null;
let prdJsonCallback: ToolCallback<z.infer<typeof prdJsonOutputSchema>> | null = null;

export function onInterviewOutput(cb: ToolCallback<z.infer<typeof interviewOutputSchema>>) {
	interviewCallback = cb;
}

export function onPrdOutput(cb: ToolCallback<z.infer<typeof prdOutputSchema>>) {
	prdCallback = cb;
}

export function onPrdJsonOutput(cb: ToolCallback<z.infer<typeof prdJsonOutputSchema>>) {
	prdJsonCallback = cb;
}

// --- Tool definitions ---

const generateInterviewTool = tool(
	"generate_interview",
	"Generate structured interview questions with options for PRD creation. Call this after researching the codebase to ask the user clarifying questions.",
	{
		questions: z
			.array(
				z.object({
					text: z.string().describe("The question to ask the user"),
					options: z.array(z.string()).min(2).max(5).describe("Answer options (2-5 choices)"),
				}),
			)
			.min(3)
			.max(7)
			.describe("3-7 clarifying questions"),
	},
	async (args) => {
		const parsed = interviewOutputSchema.parse(args);
		if (interviewCallback) interviewCallback(parsed);
		return {
			content: [
				{
					type: "text" as const,
					text: `Generated ${parsed.questions.length} interview questions. The user will now answer them.`,
				},
			],
		};
	},
);

const generatePrdTool = tool(
	"generate_prd",
	"Generate a structured PRD document in markdown format with any open questions. Call this after the interview is complete.",
	{
		markdown: z.string().describe("Full PRD in markdown format"),
		openQuestions: z
			.array(z.object({ text: z.string().describe("An open question") }))
			.describe("Unresolved questions"),
	},
	async (args) => {
		const parsed = prdOutputSchema.parse(args);
		if (prdCallback) prdCallback(parsed);
		return {
			content: [
				{
					type: "text" as const,
					text: `PRD generated (${parsed.markdown.length} chars) with ${parsed.openQuestions.length} open questions.`,
				},
			],
		};
	},
);

const generatePrdJsonTool = tool(
	"generate_prd_json",
	"Convert the approved PRD into a prd.json file for Ralph execution. Each user story must be small enough for one iteration.",
	{
		project: z.string().describe("Project name"),
		branchName: z.string().describe("Git branch name (ralph/feature-name)"),
		description: z.string().describe("Feature description"),
		userStories: z
			.array(
				z.object({
					id: z.string().describe("Story ID like US-001"),
					title: z.string().describe("Short story title"),
					description: z.string().describe("User story description"),
					acceptanceCriteria: z.array(z.string()).describe("Acceptance criteria"),
					priority: z.number().int().positive().describe("Priority (1 = highest)"),
					passes: z.literal(false),
					notes: z.string().default(""),
				}),
			)
			.min(1),
	},
	async (args) => {
		const parsed = prdJsonOutputSchema.parse(args);
		if (prdJsonCallback) prdJsonCallback(parsed);
		return {
			content: [
				{
					type: "text" as const,
					text: `Generated prd.json with ${parsed.userStories.length} stories for project "${parsed.project}".`,
				},
			],
		};
	},
);

// --- MCP Server ---

export const prdToolsServer = createSdkMcpServer({
	name: "ralph-prd-tools",
	version: "1.0.0",
	tools: [generateInterviewTool, generatePrdTool, generatePrdJsonTool],
});

// Tool name constants for allowedTools configuration
export const TOOL_NAMES = {
	interview: "mcp__ralph-prd-tools__generate_interview",
	prd: "mcp__ralph-prd-tools__generate_prd",
	prdJson: "mcp__ralph-prd-tools__generate_prd_json",
} as const;
