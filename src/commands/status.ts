import {
	type PRD,
	type Story,
	effectiveReviewPasses,
	nextIncompleteStory,
	nextReviewStory,
	readPrd,
} from "../core/prd.js";
import { dim, fail, pass, subtitle, title } from "../tui/styles.js";

export function render(prd: PRD, reviewDefault: number): string {
	const lines: string[] = [];

	lines.push(title(prd.project));
	lines.push(subtitle(`${prd.branchName} — ${prd.userStories.length} stories`));
	lines.push("");

	const maxIdLen = Math.max(...prd.userStories.map((s) => s.id.length));
	const maxTitleLen = Math.max(...prd.userStories.map((s) => s.title.length));

	let completed = 0;
	for (const story of prd.userStories) {
		const icon = story.passes ? pass("\u2713") : fail("\u2717");
		if (story.passes) completed++;

		const id = story.id.padEnd(maxIdLen);
		const storyTitle = story.title.padEnd(maxTitleLen);
		const priority = dim(`P${story.priority}`);

		lines.push(`  ${icon}  ${id}  ${storyTitle}  ${priority}`);
	}

	lines.push("");
	lines.push(`Progress: ${completed}/${prd.userStories.length} complete`);

	let next: Story | null = nextIncompleteStory(prd);
	if (!next) {
		next = nextReviewStory(prd, reviewDefault);
	}
	if (next) {
		if (next.passes) {
			const eff = effectiveReviewPasses(next, reviewDefault);
			lines.push(
				`Next: ${next.id} — ${next.title} (review ${(next.reviewsCompleted ?? 0) + 1}/${eff})`,
			);
		} else {
			lines.push(`Next: ${next.id} — ${next.title}`);
		}
	}

	return lines.join("\n");
}

/** Compact story list for display during run loop. */
export function renderCompact(prd: PRD, maxTitleLen = 35): string {
	const lines: string[] = [];
	for (const story of prd.userStories) {
		const icon = story.passes ? pass("\u2713") : fail("\u2717");
		const storyTitle =
			story.title.length > maxTitleLen
				? `${story.title.slice(0, maxTitleLen - 3)}...`
				: story.title;
		lines.push(`  ${icon}  ${story.id}  ${storyTitle}`);
	}
	const completed = prd.userStories.filter((s) => s.passes).length;
	lines.push(dim(`  ${completed}/${prd.userStories.length} complete`));
	return lines.join("\n");
}

export async function statusCommand(prdFile: string, reviewDefault: number): Promise<void> {
	const prd = await readPrd(prdFile);
	console.log(render(prd, reviewDefault));
}

export async function confirm(
	prd: PRD,
	reviewDefault: number,
	tool: string,
	maxIter: number,
): Promise<boolean> {
	console.log(render(prd, reviewDefault));
	console.log();
	console.log(`Tool: ${tool} | Max iterations: ${maxIter}\n`);

	if (!process.stdin.isTTY) {
		return true;
	}

	process.stdout.write("Press Enter to start, or q + Enter to quit: ");
	for await (const chunk of console) {
		const line = chunk.toString().trim();
		return line !== "q" && line !== "Q";
	}
	return true;
}
