import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Walks up from `start` to the nearest package.json that carries `suede.from`.
 * Works from the main checkout or from any task worktree.
 */
export function findProjectRoot(start: string): string | undefined {
	let directory = start;
	while (true) {
		const manifestPath = join(directory, 'package.json');
		if (existsSync(manifestPath)) {
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
				suede?: { from?: unknown };
			};
			if (typeof manifest.suede?.from === 'string') return directory;
		}
		const parent = dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

export const NOT_A_PROJECT =
	'Not inside a suede project: no package.json with "suede.from" above this directory.';

/**
 * Walks up from `start` to the nearest directory holding `.git`: a directory in
 * the main checkout, a file in a task worktree. Reads no manifest, so it finds
 * any git repository, suede project or not.
 */
export function findGitRoot(start: string): string | undefined {
	let directory = start;
	while (true) {
		if (existsSync(join(directory, '.git'))) return directory;
		const parent = dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

export const NOT_A_GIT_REPO = 'Not inside a git repository: no .git above this directory.';
