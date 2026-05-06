export interface Story {
	id: string;
	title: string;
	description: string;
	acceptanceCriteria: string[];
	priority: number;
	passes: boolean;
	notes: string;
	reviewPasses?: number;
	reviewsCompleted?: number;
}

export interface PRD {
	project: string;
	branchName: string;
	description: string;
	userStories: Story[];
}

export function effectiveReviewPasses(story: Story, defaultPasses: number): number {
	if (story.reviewPasses != null) {
		return story.reviewPasses;
	}
	return defaultPasses;
}

export async function readPrd(path: string): Promise<PRD> {
	const file = Bun.file(path);
	const text = await file.text();
	return JSON.parse(text) as PRD;
}

export async function writePrd(path: string, prd: PRD): Promise<void> {
	const json = `${JSON.stringify(prd, null, "  ")}\n`;
	await Bun.write(path, json);
}

export function nextIncompleteStory(prd: PRD): Story | null {
	let best: Story | null = null;
	for (const story of prd.userStories) {
		if (!story.passes) {
			if (best === null || story.priority < best.priority) {
				best = story;
			}
		}
	}
	return best;
}

export function nextReviewStory(prd: PRD, defaultPasses: number): Story | null {
	for (const story of prd.userStories) {
		if (
			story.passes &&
			(story.reviewsCompleted ?? 0) < effectiveReviewPasses(story, defaultPasses)
		) {
			return story;
		}
	}
	return null;
}

export function allComplete(prd: PRD, defaultReviewPasses: number): boolean {
	for (const story of prd.userStories) {
		if (!story.passes) {
			return false;
		}
		if ((story.reviewsCompleted ?? 0) < effectiveReviewPasses(story, defaultReviewPasses)) {
			return false;
		}
	}
	return true;
}
