export type PrdPhase = "research" | "interview" | "draft" | "open_questions" | "review" | "convert";
export type PhaseStatus = "pending" | "in_progress" | "complete";

export interface InterviewQuestion {
	text: string;
	options: string[];
	answer?: string;
	discussionUsed: boolean;
}

export interface OpenQuestion {
	text: string;
	resolved: boolean;
	resolution: string | null;
}

export interface ResearchPhaseData {
	status: PhaseStatus;
	findings?: string;
	completedAt?: string;
}

export interface InterviewPhaseData {
	status: PhaseStatus;
	questions: InterviewQuestion[];
	completedAt?: string;
}

export interface DraftPhaseData {
	status: PhaseStatus;
	prdMarkdown?: string;
	prdFilePath?: string;
	completedAt?: string;
}

export interface OpenQuestionsPhaseData {
	status: PhaseStatus;
	questions: OpenQuestion[];
	completedAt?: string;
}

export interface ReviewPhaseData {
	status: PhaseStatus;
	approved?: boolean;
	completedAt?: string;
}

export interface ConvertPhaseData {
	status: PhaseStatus;
	outputPath?: string;
	completedAt?: string;
}

export interface PrdSession {
	id: string;
	description: string;
	createdAt: string;
	updatedAt: string;
	claudeSessionId?: string;
	model: string;
	currentPhase: PrdPhase;
	phases: {
		research: ResearchPhaseData;
		interview: InterviewPhaseData;
		draft: DraftPhaseData;
		open_questions: OpenQuestionsPhaseData;
		review: ReviewPhaseData;
		convert: ConvertPhaseData;
	};
}

const PHASE_ORDER: PrdPhase[] = [
	"research",
	"interview",
	"draft",
	"open_questions",
	"review",
	"convert",
];

export { PHASE_ORDER };

export function createSession(description: string, model = "claude-sonnet-4-6"): PrdSession {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		description,
		createdAt: now,
		updatedAt: now,
		model,
		currentPhase: "research",
		phases: {
			research: { status: "pending" },
			interview: { status: "pending", questions: [] },
			draft: { status: "pending" },
			open_questions: { status: "pending", questions: [] },
			review: { status: "pending" },
			convert: { status: "pending" },
		},
	};
}

export async function readSession(path: string): Promise<PrdSession> {
	const file = Bun.file(path);
	const text = await file.text();
	return JSON.parse(text) as PrdSession;
}

export async function writeSession(path: string, session: PrdSession): Promise<void> {
	session.updatedAt = new Date().toISOString();
	const json = `${JSON.stringify(session, null, "  ")}\n`;
	await Bun.write(path, json);
}

export function advancePhase(session: PrdSession): PrdSession {
	const currentIndex = PHASE_ORDER.indexOf(session.currentPhase);
	const currentPhaseData = session.phases[session.currentPhase];
	currentPhaseData.status = "complete";
	if ("completedAt" in currentPhaseData) {
		currentPhaseData.completedAt = new Date().toISOString();
	}

	const nextIndex = currentIndex + 1;
	if (nextIndex < PHASE_ORDER.length) {
		const nextPhase = PHASE_ORDER[nextIndex];
		if (nextPhase) {
			session.currentPhase = nextPhase;
			session.phases[nextPhase].status = "in_progress";
		}
	}

	return session;
}
