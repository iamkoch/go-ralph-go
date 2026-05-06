import chalk from "chalk";

/** Bold header text. */
export function header(text: string): string {
	return chalk.bold(text);
}

/** Dimmed/faint text. */
export function dim(text: string): string {
	return chalk.dim(text);
}

/** Bold green text for success messages. */
export function success(text: string): string {
	return chalk.bold.green(text);
}

/** Bold red text for failure messages. */
export function fail(text: string): string {
	return chalk.bold.red(text);
}

/** Bold title text. */
export function title(text: string): string {
	return chalk.bold(text);
}

/** Dimmed subtitle text. */
export function subtitle(text: string): string {
	return chalk.dim(text);
}

/** Green text for pass indicators. */
export function pass(text: string): string {
	return chalk.green(text);
}
