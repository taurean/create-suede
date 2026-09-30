import { homedir } from 'node:os';
import { styleText } from 'node:util';

type Format = Parameters<typeof styleText>[0];

/** Colors text for stdout; plain when stdout isn't a TTY or NO_COLOR is set. */
export function paint(format: Format, text: string): string {
	return styleText(format, text, { stream: process.stdout });
}

const WORDMARK = ['┌─┐┬ ┬┌─┐┌┬┐┌─┐', '└─┐│ │├┤  ││├┤ ', '└─┘└─┘└─┘─┴┘└─┘'];
const WORDMARK_COLORS: Format[] = ['magenta', 'magentaBright', 'cyan'];

export function wordmark(): string {
	return WORDMARK.map((line, index) => paint(WORDMARK_COLORS[index] ?? 'cyan', line)).join('\n');
}

/** Shortens paths under the home directory to `~/…` for display. */
export function tildify(path: string): string {
	const home = homedir();
	return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
