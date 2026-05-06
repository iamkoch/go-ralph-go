import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type PRD,
	type Story,
	allComplete,
	effectiveReviewPasses,
	nextIncompleteStory,
	nextReviewStory,
	readPrd,
	writePrd,
} from "./prd.js";

function makeStory(overrides: Partial<Story> = {}): Story {
	return {
		id: "US-001",
		title: "Test story",
		description: "A test story",
		acceptanceCriteria: ["Typecheck passes"],
		priority: 1,
		passes: false,
		notes: "",
		...overrides,
	};
}

function makePrd(overrides: Partial<PRD> = {}): PRD {
	return {
		project: "TestProject",
		branchName: "ralph/test",
		description: "Test PRD",
		userStories: [makeStory()],
		...overrides,
	};
}

describe("effectiveReviewPasses", () => {
	test("returns story-specific value when set", () => {
		const story = makeStory({ reviewPasses: 3 });
		expect(effectiveReviewPasses(story, 1)).toBe(3);
	});

	test("returns default when story has no reviewPasses", () => {
		const story = makeStory();
		expect(effectiveReviewPasses(story, 2)).toBe(2);
	});
});

describe("nextIncompleteStory", () => {
	test("returns highest priority incomplete story", () => {
		const prd = makePrd({
			userStories: [
				makeStory({ id: "US-001", priority: 3, passes: false }),
				makeStory({ id: "US-002", priority: 1, passes: false }),
				makeStory({ id: "US-003", priority: 2, passes: true }),
			],
		});
		const next = nextIncompleteStory(prd);
		expect(next?.id).toBe("US-002");
	});

	test("returns null when all stories pass", () => {
		const prd = makePrd({
			userStories: [makeStory({ passes: true }), makeStory({ id: "US-002", passes: true })],
		});
		expect(nextIncompleteStory(prd)).toBeNull();
	});
});

describe("nextReviewStory", () => {
	test("returns first story needing reviews", () => {
		const prd = makePrd({
			userStories: [
				makeStory({ id: "US-001", passes: true, reviewsCompleted: 2, reviewPasses: 2 }),
				makeStory({ id: "US-002", passes: true, reviewsCompleted: 0 }),
			],
		});
		const next = nextReviewStory(prd, 1);
		expect(next?.id).toBe("US-002");
	});

	test("returns null when all reviews complete", () => {
		const prd = makePrd({
			userStories: [
				makeStory({ passes: true, reviewsCompleted: 1 }),
				makeStory({ id: "US-002", passes: true, reviewsCompleted: 1 }),
			],
		});
		expect(nextReviewStory(prd, 1)).toBeNull();
	});

	test("skips stories that haven't passed yet", () => {
		const prd = makePrd({
			userStories: [makeStory({ passes: false, reviewsCompleted: 0 })],
		});
		expect(nextReviewStory(prd, 1)).toBeNull();
	});
});

describe("allComplete", () => {
	test("returns true when all stories pass and reviews done", () => {
		const prd = makePrd({
			userStories: [
				makeStory({ passes: true, reviewsCompleted: 1 }),
				makeStory({ id: "US-002", passes: true, reviewsCompleted: 1 }),
			],
		});
		expect(allComplete(prd, 1)).toBe(true);
	});

	test("returns false when some stories incomplete", () => {
		const prd = makePrd({
			userStories: [makeStory({ passes: true }), makeStory({ id: "US-002", passes: false })],
		});
		expect(allComplete(prd, 0)).toBe(false);
	});

	test("returns false when reviews pending", () => {
		const prd = makePrd({
			userStories: [makeStory({ passes: true, reviewsCompleted: 0 })],
		});
		expect(allComplete(prd, 2)).toBe(false);
	});

	test("returns true with zero review passes", () => {
		const prd = makePrd({
			userStories: [makeStory({ passes: true })],
		});
		expect(allComplete(prd, 0)).toBe(true);
	});
});

describe("readPrd/writePrd", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "ralph-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	test("round-trips PRD to JSON file", async () => {
		const prd = makePrd({
			userStories: [
				makeStory({ id: "US-001", priority: 1 }),
				makeStory({ id: "US-002", priority: 2, passes: true }),
			],
		});

		const path = join(tempDir, "prd.json");
		await writePrd(path, prd);

		const loaded = await readPrd(path);
		expect(loaded.project).toBe("TestProject");
		expect(loaded.branchName).toBe("ralph/test");
		expect(loaded.userStories).toHaveLength(2);
		expect(loaded.userStories[0]?.id).toBe("US-001");
		expect(loaded.userStories[1]?.passes).toBe(true);
	});

	test("preserves reviewPasses field", async () => {
		const prd = makePrd({
			userStories: [makeStory({ reviewPasses: 3, reviewsCompleted: 1 })],
		});

		const path = join(tempDir, "prd.json");
		await writePrd(path, prd);

		const loaded = await readPrd(path);
		expect(loaded.userStories[0]?.reviewPasses).toBe(3);
		expect(loaded.userStories[0]?.reviewsCompleted).toBe(1);
	});
});
