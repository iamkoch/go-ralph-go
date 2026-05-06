declare module "marked-terminal" {
	interface TerminalRendererOptions {
		code?: (code: string) => string;
		blockquote?: (quote: string) => string;
		html?: (html: string) => string;
		heading?: (text: string, level: number) => string;
		firstHeading?: (text: string, level: number) => string;
		hr?: () => string;
		listitem?: (text: string) => string;
		table?: (header: string, body: string) => string;
		paragraph?: (text: string) => string;
		strong?: (text: string) => string;
		em?: (text: string) => string;
		codespan?: (text: string) => string;
		del?: (text: string) => string;
		link?: (href: string, title: string, text: string) => string;
		image?: (href: string, title: string, text: string) => string;
		width?: number;
		reflowText?: boolean;
		showSectionPrefix?: boolean;
		unescape?: boolean;
		emoji?: boolean;
		tableOptions?: Record<string, unknown>;
		tab?: number;
	}

	class TerminalRenderer {
		constructor(options?: TerminalRendererOptions);
	}

	export default TerminalRenderer;
}
