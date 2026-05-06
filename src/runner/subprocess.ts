import { join } from "node:path";
import type { Tool } from "../core/types.js";

export interface RunOptions {
	tool: Tool;
	/** Directory containing CLAUDE.md / prompt.md. */
	promptDir: string;
	/** Repository root — subprocess CWD. */
	repoRoot: string;
	team: boolean;
	reviewPreamble?: string;
}

export interface RunResult {
	lines: AsyncGenerator<string>;
	exitCode: Promise<number>;
}

const teamInstructions = `## Team Mode

You MUST use agent teams for this iteration:
1. Use TeamCreate to create a team for the current story
2. Break the story into parallel subtasks (e.g., backend + frontend, or implementation + tests)
3. Spawn specialized teammates using the Task tool
4. Coordinate via the task list — assign work, track progress
5. Shut down the team when the story is complete

Use team members for genuinely parallel work only. Don't create a team for trivial single-file changes.`;

export async function run(opts: RunOptions): Promise<RunResult> {
	let args: string[];
	let stdinFile: string;

	switch (opts.tool) {
		case "amp":
			args = ["amp", "--dangerously-allow-all"];
			stdinFile = join(opts.promptDir, "prompt.md");
			break;
		case "claude":
			args = ["claude", "--dangerously-skip-permissions", "--print"];
			stdinFile = join(opts.promptDir, "CLAUDE.md");
			break;
		default:
			throw new Error(`unknown tool: ${opts.tool satisfies never}`);
	}

	let content = await Bun.file(stdinFile).text();

	if (opts.reviewPreamble) {
		content = `${opts.reviewPreamble}\n\n${content}`;
	}

	if (opts.team) {
		content = `${content}\n\n${teamInstructions}`;
	}

	const proc = Bun.spawn(args, {
		cwd: opts.repoRoot,
		stdin: new Blob([content]),
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = proc.exited;

	async function* mergeStreams(
		stdout: ReadableStream<Uint8Array>,
		stderr: ReadableStream<Uint8Array>,
	): AsyncGenerator<string> {
		const decoder = new TextDecoder();
		let buffer = "";

		async function* readStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value) yield value;
				}
			} finally {
				reader.releaseLock();
			}
		}

		const stdoutIter = readStream(stdout);
		const stderrIter = readStream(stderr);

		type PendingRead = {
			source: "stdout" | "stderr";
			promise: Promise<{ source: "stdout" | "stderr"; result: IteratorResult<Uint8Array> }>;
		};

		const pending: PendingRead[] = [];

		function startRead(iter: AsyncGenerator<Uint8Array>, source: "stdout" | "stderr"): PendingRead {
			const promise = iter.next().then((result) => ({ source, result }));
			return { source, promise };
		}

		pending.push(startRead(stdoutIter, "stdout"));
		pending.push(startRead(stderrIter, "stderr"));

		while (pending.length > 0) {
			const settled = await Promise.race(pending.map((p) => p.promise));
			const idx = pending.findIndex((p) => p.source === settled.source);
			pending.splice(idx, 1);

			if (!settled.result.done) {
				buffer += decoder.decode(settled.result.value, { stream: true });
				const parts = buffer.split("\n");
				buffer = parts.pop() ?? "";
				for (const line of parts) {
					yield line;
				}

				const iter = settled.source === "stdout" ? stdoutIter : stderrIter;
				pending.push(startRead(iter, settled.source));
			}
		}

		// Flush remaining buffer
		buffer += decoder.decode(undefined, { stream: false });
		if (buffer) {
			yield buffer;
		}
	}

	const lines = mergeStreams(proc.stdout, proc.stderr);

	return { lines, exitCode };
}
