/**
 * ralph prd <description> — PRD creation flow.
 * ralph prd (no args, existing prd.json) — interactive hub.
 * ralph prd (no args, markdown PRD in tasks/) — offer to convert.
 * ralph prd (no args, existing prd-session.json) — offer to resume creation.
 */
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { resolveBaseDir } from "../core/config.js";
import { readPrd } from "../core/prd.js";
import { createSession, readSession, writeSession } from "../core/session.js";
import { prdHub } from "../prd-flow/hub.js";
import { orchestrate } from "../prd-flow/orchestrator.js";

/** Find markdown PRD files in tasks/ directory. */
async function findTaskPrds(baseDir: string): Promise<string[]> {
	const tasksDir = join(baseDir, "tasks");
	try {
		const files = await readdir(tasksDir);
		return files.filter((f) => f.startsWith("prd-") && f.endsWith(".md")).map((f) => join(tasksDir, f));
	} catch {
		return [];
	}
}

export async function prdCommand(
	description: string | undefined,
	options: { resume?: boolean; restart?: boolean },
): Promise<void> {
	// If no description and no flags, try to open the hub or resume session
	if (!description && !options.resume && !options.restart) {
		const baseDir = await resolveBaseDir();
		const prdPath = join(baseDir, "prd.json");

		// Check for existing prd.json → hub
		try {
			const prd = await readPrd(prdPath);
			await prdHub(prd, prdPath, baseDir);
			return;
		} catch {
			// No prd.json
		}

		// Check for markdown PRDs in tasks/ → offer to review & convert
		// Look in both baseDir and CWD (baseDir might be scripts/ralph/)
		const cwd = process.cwd();
		const searchDirs = [cwd];
		if (baseDir !== cwd) searchDirs.push(baseDir);

		let foundPrds: string[] = [];
		for (const dir of searchDirs) {
			foundPrds = await findTaskPrds(dir);
			if (foundPrds.length > 0) break;
		}

		if (foundPrds.length > 0) {
			let selectedPrd: string;

			if (foundPrds.length === 1) {
				selectedPrd = foundPrds[0]!;
			} else {
				const choice = await p.select({
					message: "Found markdown PRDs in tasks/. Which one?",
					options: foundPrds.map((f) => ({
						value: f,
						label: f.split("/").pop()!,
					})),
				});
				if (p.isCancel(choice)) return;
				selectedPrd = choice as string;
			}

			const filename = selectedPrd.split("/").pop()!;
			const action = await p.select({
				message: `Found ${filename} — no prd.json yet`,
				options: [
					{ value: "review", label: "Review & convert to prd.json", hint: "review markdown, then convert" },
					{ value: "convert", label: "Convert to prd.json directly", hint: "skip review" },
					{ value: "quit", label: "Quit" },
				],
			});

			if (p.isCancel(action) || action === "quit") return;

			// Read the markdown content
			const markdown = await Bun.file(selectedPrd).text();

			// Create a synthetic session at the appropriate phase
			const session = createSession(filename.replace(/^prd-/, "").replace(/\.md$/, ""));
			session.phases.research.status = "complete";
			session.phases.interview.status = "complete";
			session.phases.draft.status = "complete";
			session.phases.draft.prdMarkdown = markdown;
			session.phases.open_questions.status = "complete";

			if (action === "review") {
				session.currentPhase = "review";
				session.phases.review.status = "in_progress";
			} else {
				session.phases.review.status = "complete";
				session.phases.review.approved = true;
				session.currentPhase = "convert";
				session.phases.convert.status = "in_progress";
			}

			await writeSession("prd-session.json", session);
			await orchestrate({ resume: true });
			return;
		}

		// Check for prd-session.json → offer to resume creation flow
		try {
			const session = await readSession("prd-session.json");
			const action = await p.select({
				message: `Found in-progress PRD session: "${session.description}" (phase: ${session.currentPhase})`,
				options: [
					{ value: "resume", label: "Resume session" },
					{ value: "discard", label: "Discard session" },
					{ value: "quit", label: "Quit" },
				],
			});

			if (p.isCancel(action) || action === "quit") return;

			if (action === "resume") {
				await orchestrate({ resume: true });
				return;
			}

			// Discard: delete session file
			try {
				await unlink("prd-session.json");
			} catch {
				// Already gone
			}
			p.log.info('Session discarded. Start a new one with: ralph prd "description"');
			return;
		} catch {
			// No session file either
		}
	}

	await orchestrate({
		description,
		resume: options.resume,
		restart: options.restart,
	});
}
