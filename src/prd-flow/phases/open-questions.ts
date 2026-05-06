/**
 * Phase 4: Open Questions — resolve ambiguities one by one.
 */
import * as p from "@clack/prompts";
import type { OpenQuestion, PrdSession } from "../../core/session.js";
import { writeSession } from "../../core/session.js";
import { breakoutDiscussion } from "../breakout.js";

export async function runOpenQuestions(
	session: PrdSession,
	questions: OpenQuestion[],
	sessionPath: string,
): Promise<OpenQuestion[]> {
	if (questions.length === 0) {
		p.log.info("No open questions to resolve.");
		return questions;
	}

	p.log.info(`${questions.length} open question(s) to resolve`);

	for (const question of questions) {
		if (question.resolved) continue;

		const action = await p.select({
			message: question.text,
			options: [
				{ value: "answer", label: "Type an answer" },
				{ value: "discuss", label: "? Discuss with Claude" },
				{ value: "skip", label: "/skip — defer this question" },
			],
		});

		if (p.isCancel(action)) {
			p.log.warn("Open questions cancelled");
			return questions;
		}

		if (action === "skip") {
			continue;
		}

		if (action === "discuss") {
			const { resolution } = await breakoutDiscussion(
				question.text,
				"This is an open question from the PRD draft.",
				session,
			);
			if (resolution) {
				question.resolved = true;
				question.resolution = resolution;
			}
		} else {
			const answer = await p.text({
				message: "Your answer:",
				placeholder: "Type your resolution...",
			});

			if (p.isCancel(answer)) continue;

			question.resolved = true;
			question.resolution = String(answer);
		}

		// Save progress after each resolution (crash-safe)
		session.phases.open_questions.questions = questions;
		await writeSession(sessionPath, session);
	}

	const resolved = questions.filter((q) => q.resolved).length;
	p.log.success(`${resolved}/${questions.length} questions resolved`);

	return questions;
}
