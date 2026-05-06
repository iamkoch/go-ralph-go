import { describe, expect, test } from "bun:test";
import type { PRD, Story } from "../core/prd.js";
import { prdToMarkdown } from "./hub.js";

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

describe("prdToMarkdown", () => {
	test("includes project heading and description", () => {
		const md = prdToMarkdown(makePrd());
		expect(md).toContain("# TestProject");
		expect(md).toContain("Test PRD");
	});

	test("includes branch name", () => {
		const md = prdToMarkdown(makePrd());
		expect(md).toContain("`ralph/test`");
	});

	test("shows progress stats", () => {
		const prd = makePrd({
			userStories: [
				makeStory({ passes: true }),
				makeStory({ id: "US-002", passes: false }),
				makeStory({ id: "US-003", passes: true }),
			],
		});
		const md = prdToMarkdown(prd);
		expect(md).toContain("2/3 stories complete");
	});

	test("renders incomplete story with empty checkbox", () => {
		const md = prdToMarkdown(makePrd({ userStories: [makeStory({ passes: false })] }));
		expect(md).toContain("[ ] US-001");
	});

	test("renders complete story with checked checkbox", () => {
		const md = prdToMarkdown(makePrd({ userStories: [makeStory({ passes: true })] }));
		expect(md).toContain("[x] US-001");
	});

	test("includes story title and priority", () => {
		const md = prdToMarkdown(
			makePrd({
				userStories: [makeStory({ id: "US-005", title: "Add auth", priority: 2 })],
			}),
		);
		expect(md).toContain("US-005 — Add auth (P2)");
	});

	test("includes acceptance criteria", () => {
		const md = prdToMarkdown(
			makePrd({
				userStories: [makeStory({ acceptanceCriteria: ["Typecheck passes", "Tests pass"] })],
			}),
		);
		expect(md).toContain("**Acceptance Criteria:**");
		expect(md).toContain("- Typecheck passes");
		expect(md).toContain("- Tests pass");
	});

	test("includes notes when present", () => {
		const md = prdToMarkdown(makePrd({ userStories: [makeStory({ notes: "Uses JWT tokens" })] }));
		expect(md).toContain("**Notes:** Uses JWT tokens");
	});

	test("omits notes when empty", () => {
		const md = prdToMarkdown(makePrd({ userStories: [makeStory({ notes: "" })] }));
		expect(md).not.toContain("**Notes:**");
	});

	test("handles zero stories", () => {
		const md = prdToMarkdown(makePrd({ userStories: [] }));
		expect(md).toContain("0/0 stories complete");
		expect(md).toContain("## User Stories");
	});
});
