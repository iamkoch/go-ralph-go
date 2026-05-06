/**
 * PRD Flow Orchestrator — main loop that drives through all 6 phases.
 * Reads session state, runs the current phase, saves progress, advances.
 */
import * as p from "@clack/prompts";
import {
	type PrdSession,
	advancePhase,
	createSession,
	readSession,
	writeSession,
} from "../core/session.js";
import { runConvert } from "./phases/convert.js";
import { runDraft } from "./phases/draft.js";
import { runInterview } from "./phases/interview.js";
import { runOpenQuestions } from "./phases/open-questions.js";
import { runResearch } from "./phases/research.js";
import { runReview } from "./phases/review.js";

const SESSION_FILE = "prd-session.json";

export interface OrchestratorOptions {
	description?: string;
	resume?: boolean;
	restart?: boolean;
}

export async function orchestrate(opts: OrchestratorOptions): Promise<void> {
	p.intro("Ralph PRD Flow");

	let session: PrdSession;
	const sessionPath = SESSION_FILE;

	// Determine session state
	if (opts.restart) {
		if (!opts.description) {
			p.log.error("Please provide a feature description with --restart.");
			return;
		}
		session = createSession(opts.description);
		await writeSession(sessionPath, session);
		p.log.info("Starting fresh session");
	} else if (opts.resume) {
		try {
			session = await readSession(sessionPath);
			p.log.info(`Resuming session: ${session.description}`);
			p.log.info(`Current phase: ${session.currentPhase}`);
		} catch {
			p.log.error('No session to resume. Start a new one with: ralph prd "description"');
			return;
		}
	} else {
		if (!opts.description) {
			p.log.error('Please provide a feature description: ralph prd "add user auth"');
			return;
		}

		// Check for existing session
		try {
			const existing = await readSession(sessionPath);
			const action = await p.select({
				message: `Found existing session: "${existing.description}" (phase: ${existing.currentPhase})`,
				options: [
					{ value: "resume", label: "Resume existing session" },
					{ value: "restart", label: "Start fresh (discard existing)" },
				],
			});

			if (p.isCancel(action)) return;

			if (action === "resume") {
				session = existing;
			} else {
				session = createSession(opts.description);
				await writeSession(sessionPath, session);
			}
		} catch {
			session = createSession(opts.description);
			await writeSession(sessionPath, session);
		}
	}

	// Run phases in order, starting from currentPhase
	try {
		await runPhases(session, sessionPath);
	} catch (err) {
		p.log.error(`Error in phase ${session.currentPhase}: ${err}`);
		p.log.info("Your progress has been saved. Resume with: ralph prd --resume");
		await writeSession(sessionPath, session);
	}
}

async function runPhases(session: PrdSession, sessionPath: string): Promise<void> {
	// Phase 1: Research
	if (session.currentPhase === "research") {
		session.phases.research.status = "in_progress";
		await writeSession(sessionPath, session);

		const findings = await runResearch(session);

		session.phases.research.findings = findings;
		advancePhase(session);
		await writeSession(sessionPath, session);
	}

	// Phase 2: Interview
	if (session.currentPhase === "interview") {
		session.phases.interview.status = "in_progress";
		await writeSession(sessionPath, session);

		const research = session.phases.research.findings || "";
		const questions = await runInterview(session, research);

		session.phases.interview.questions = questions;
		advancePhase(session);
		await writeSession(sessionPath, session);
	}

	// Phase 3: Draft
	if (session.currentPhase === "draft") {
		session.phases.draft.status = "in_progress";
		await writeSession(sessionPath, session);

		const research = session.phases.research.findings || "";
		const questions = session.phases.interview.questions;
		const result = await runDraft(session, research, questions);

		session.phases.draft.prdMarkdown = result.markdown;
		session.phases.draft.prdFilePath = result.filePath;
		session.phases.open_questions.questions = result.openQuestions;

		// Skip open questions if there are none
		if (result.openQuestions.length === 0) {
			advancePhase(session); // draft -> open_questions
			advancePhase(session); // open_questions -> review
		} else {
			advancePhase(session);
		}
		await writeSession(sessionPath, session);
	}

	// Phase 4: Open Questions
	if (session.currentPhase === "open_questions") {
		session.phases.open_questions.status = "in_progress";
		await writeSession(sessionPath, session);

		const questions = await runOpenQuestions(
			session,
			session.phases.open_questions.questions,
			sessionPath,
		);

		session.phases.open_questions.questions = questions;
		advancePhase(session);
		await writeSession(sessionPath, session);
	}

	// Phase 5: Review
	if (session.currentPhase === "review") {
		session.phases.review.status = "in_progress";
		await writeSession(sessionPath, session);

		const markdown = session.phases.draft.prdMarkdown || "";
		const { approved, markdown: finalMarkdown } = await runReview(session, markdown);

		if (!approved) {
			p.log.warn("PRD not approved. Resume later with: ralph prd --resume");
			return;
		}

		session.phases.draft.prdMarkdown = finalMarkdown;
		session.phases.review.approved = true;
		advancePhase(session);
		await writeSession(sessionPath, session);
	}

	// Phase 6: Convert
	if (session.currentPhase === "convert") {
		session.phases.convert.status = "in_progress";
		await writeSession(sessionPath, session);

		const markdown = session.phases.draft.prdMarkdown || "";
		const outputPath = "prd.json";
		const prd = await runConvert(session, markdown, outputPath);

		if (prd) {
			session.phases.convert.outputPath = outputPath;
			advancePhase(session);
			await writeSession(sessionPath, session);

			// Ask to start execution
			const startExec = await p.confirm({
				message: "Start ralph execution? (ralph run)",
			});

			if (p.isCancel(startExec)) return;

			if (startExec) {
				p.log.info("Starting ralph execution...");
				// Import dynamically to avoid circular dependency
				const { runCommand } = await import("../commands/run.js");
				const { resolvePaths } = await import("../core/config.js");
				const paths = await resolvePaths();
				await runCommand({
					tool: "claude",
					prdFile: paths.prdFile!,
					promptDir: paths.promptDir,
					repoRoot: paths.repoRoot,
					maxIterations: 10,
					team: false,
					reviewDefault: 0,
				});
			}
		}
	}

	p.outro("PRD flow complete!");
}
