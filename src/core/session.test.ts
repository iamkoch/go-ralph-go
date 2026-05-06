import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHASE_ORDER, advancePhase, createSession, readSession, writeSession } from "./session.js";

describe("createSession", () => {
	test("creates session with default model", () => {
		const session = createSession("add user auth");
		expect(session.description).toBe("add user auth");
		expect(session.model).toBe("claude-sonnet-4-6");
		expect(session.currentPhase).toBe("research");
		expect(session.id).toBeTruthy();
		expect(session.createdAt).toBeTruthy();
	});

	test("creates session with custom model", () => {
		const session = createSession("add dark mode", "claude-opus-4-6");
		expect(session.model).toBe("claude-opus-4-6");
	});

	test("all phases start as pending", () => {
		const session = createSession("test");
		for (const phase of PHASE_ORDER) {
			expect(session.phases[phase].status).toBe("pending");
		}
	});
});

describe("advancePhase", () => {
	test("advances from research to interview", () => {
		const session = createSession("test");
		session.phases.research.status = "in_progress";
		advancePhase(session);
		expect(session.currentPhase).toBe("interview");
		expect(session.phases.research.status as string).toBe("complete");
		expect(session.phases.interview.status as string).toBe("in_progress");
	});

	test("advances through all phases in order", () => {
		const session = createSession("test");
		for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
			advancePhase(session);
			const expected = PHASE_ORDER[i + 1] ?? "convert";
			expect(session.currentPhase).toBe(expected);
		}
	});

	test("stays at last phase when already at end", () => {
		const session = createSession("test");
		session.currentPhase = "convert";
		advancePhase(session);
		// Should mark convert as complete but not crash
		expect(session.phases.convert.status).toBe("complete");
	});
});

describe("readSession/writeSession", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "ralph-session-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	test("round-trips session to JSON", async () => {
		const session = createSession("add auth");
		session.phases.research.status = "complete";
		session.phases.research.findings = "Found Next.js 15 project";
		advancePhase(session);

		const path = join(tempDir, "prd-session.json");
		await writeSession(path, session);

		const loaded = await readSession(path);
		expect(loaded.description).toBe("add auth");
		expect(loaded.currentPhase).toBe("interview");
		expect(loaded.phases.research.findings).toBe("Found Next.js 15 project");
		expect(loaded.updatedAt).toBeTruthy();
	});

	test("writeSession updates timestamp", async () => {
		const session = createSession("test");
		const originalUpdated = session.updatedAt;

		// Small delay to ensure different timestamp
		await new Promise((r) => setTimeout(r, 10));

		const path = join(tempDir, "session.json");
		await writeSession(path, session);
		expect(session.updatedAt).not.toBe(originalUpdated);
	});
});
