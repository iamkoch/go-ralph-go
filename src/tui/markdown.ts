import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// marked-terminal's renderer is compatible at runtime but not in marked's strict types
// biome-ignore lint/suspicious/noExplicitAny: marked-terminal renderer is untyped
marked.setOptions({ renderer: new TerminalRenderer() as any });

export function renderMarkdown(md: string): string {
	return marked.parse(md) as string;
}
