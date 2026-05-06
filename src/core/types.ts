export type Tool = "amp" | "claude";

export interface RunState {
	iteration: number;
	maxIterations: number;
	tool: Tool;
	baseDir: string;
	team: boolean;
	reviewDefault: number;
	debug: boolean;
}
