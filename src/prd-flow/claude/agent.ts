/**
 * Claude Agent SDK wrapper for PRD flow phases.
 * Provides a simplified interface for querying Claude with custom tools,
 * system prompts, streaming, and session resume.
 */
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PrdSession } from "../../core/session.js";

/** Resolve the path to the claude CLI executable. */
function resolveClaudePath(): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	return join(home, ".local", "bin", "claude");
}

export interface AgentQueryOptions {
	prompt: string;
	systemPrompt: string;
	session: PrdSession;
	allowedTools?: string[];
	mcpServers?: Record<string, unknown>;
	maxTurns?: number;
	streaming?: boolean;
}

export interface AgentResult {
	text: string;
	sessionId?: string;
	structuredOutput?: unknown;
}

/**
 * Run a Claude Agent SDK query for a PRD flow phase.
 * Handles session resume, streaming output, and result extraction.
 */
export async function agentQuery(opts: AgentQueryOptions): Promise<AgentResult> {
	const messages: string[] = [];
	let sessionId: string | undefined;
	let structuredOutput: unknown;

	const queryOpts: Record<string, unknown> = {
		systemPrompt: opts.systemPrompt,
		maxTurns: opts.maxTurns ?? 5,
		model: opts.session.model,
		pathToClaudeCodeExecutable: resolveClaudePath(),
	};

	if (opts.session.claudeSessionId) {
		queryOpts.resume = opts.session.claudeSessionId;
	}

	if (opts.allowedTools) {
		queryOpts.allowedTools = opts.allowedTools;
	}

	if (opts.mcpServers) {
		queryOpts.mcpServers = opts.mcpServers;
	}

	if (opts.streaming) {
		queryOpts.includePartialMessages = true;
	}

	for await (const message of query({
		prompt: opts.prompt,
		options: queryOpts,
	})) {
		if (message.type === "assistant") {
			const content = message.message?.content;
			if (Array.isArray(content)) {
				for (const block of content) {
					if (block.type === "text") {
						messages.push(block.text);
					}
				}
			} else if (typeof content === "string") {
				messages.push(content);
			}
		}

		if (message.type === "stream_event" && opts.streaming) {
			const event = message.event;
			if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
				process.stdout.write(event.delta.text);
			}
		}

		if (message.type === "result") {
			sessionId = message.session_id;
			if (message.subtype === "success") {
				if (message.structured_output) {
					structuredOutput = message.structured_output;
				}
				if (message.result) {
					messages.push(message.result);
				}
			}
		}
	}

	return {
		text: messages.join("\n"),
		sessionId,
		structuredOutput,
	};
}

/**
 * Run a streaming agent query, yielding text chunks as they arrive.
 * Used for phases where we want real-time output (research, draft).
 */
export async function* agentStream(opts: AgentQueryOptions): AsyncGenerator<string, AgentResult> {
	const messages: string[] = [];
	let sessionId: string | undefined;
	let structuredOutput: unknown;

	const queryOpts: Record<string, unknown> = {
		systemPrompt: opts.systemPrompt,
		maxTurns: opts.maxTurns ?? 5,
		model: opts.session.model,
		includePartialMessages: true,
		pathToClaudeCodeExecutable: resolveClaudePath(),
	};

	if (opts.session.claudeSessionId) {
		queryOpts.resume = opts.session.claudeSessionId;
	}

	if (opts.allowedTools) {
		queryOpts.allowedTools = opts.allowedTools;
	}

	if (opts.mcpServers) {
		queryOpts.mcpServers = opts.mcpServers;
	}

	for await (const message of query({
		prompt: opts.prompt,
		options: queryOpts,
	})) {
		if (message.type === "stream_event") {
			const event = message.event;
			if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
				yield event.delta.text;
			}
		}

		if (message.type === "assistant") {
			const content = message.message?.content;
			if (Array.isArray(content)) {
				for (const block of content) {
					if (block.type === "text") {
						messages.push(block.text);
					}
				}
			} else if (typeof content === "string") {
				messages.push(content);
			}
		}

		if (message.type === "result") {
			sessionId = message.session_id;
			if (message.subtype === "success") {
				if (message.structured_output) {
					structuredOutput = message.structured_output;
				}
				if (message.result) {
					messages.push(message.result);
				}
			}
		}
	}

	return {
		text: messages.join("\n"),
		sessionId,
		structuredOutput,
	};
}
