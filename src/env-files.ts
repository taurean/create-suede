import { symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { run } from './exec.ts';
import { tildify } from './style.ts';

/** suede's own `.gitignore` env patterns, plus wrangler's local secrets file. */
const ENV_PATHSPECS = ['.env', '.env.*', '.dev.vars'];

/**
 * The checkout's root-level env files that git ignores and doesn't track, by name.
 * Anything else would show up as untracked wherever it's copied or linked, and
 * could be committed.
 */
export async function listEnvFiles(checkoutPath: string): Promise<string[]> {
	const output = await run(
		'git',
		['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...ENV_PATHSPECS],
		checkoutPath
	);
	// Pathspec globs cross `/`, so `.env.*` also matches files inside a `.env.d/`.
	return output.split('\0').filter((path) => path !== '' && !path.includes('/'));
}

/**
 * Symlinks the main checkout's env files into a new task worktree and returns
 * their names. `git worktree add` checks out tracked files only, so without
 * this a task worktree starts with no secrets. Links are relative, so they
 * survive the project folder moving.
 */
export async function linkEnvFiles(mainPath: string, worktreePath: string): Promise<string[]> {
	const names = await listEnvFiles(mainPath);
	const target = relative(worktreePath, mainPath);
	for (const name of names) {
		try {
			symlinkSync(join(target, name), join(worktreePath, name));
		} catch (error) {
			// EEXIST when origin/main now tracks a file main/ still ignores.
			throw new Error(
				`Could not link ${name} into ${tildify(worktreePath)}: ${(error as Error).message}`,
				{ cause: error }
			);
		}
	}
	return names;
}
