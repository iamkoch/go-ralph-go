import ora, { type Ora } from "ora";

const WORD_ROTATE_INTERVAL_MS = 3000;

export function createSpinner(): {
	spinner: Ora;
	startWordRotation(words: readonly string[]): () => void;
} {
	const spinner = ora({ color: "magenta" });

	function startWordRotation(words: readonly string[]): () => void {
		let idx = 0;
		spinner.text = words[idx] ?? "";

		const interval = setInterval(() => {
			idx = (idx + 1) % words.length;
			spinner.text = words[idx] ?? "";
		}, WORD_ROTATE_INTERVAL_MS);

		return () => clearInterval(interval);
	}

	return { spinner, startWordRotation };
}
