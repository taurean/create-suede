import { symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { run } from './exec.ts';

/** suede's own `.gitignore` env patterns, plus wrangler's local secrets file. */
const ENV_PATHSPECS = ['.env', '.env.*', '.dev.vars'];

/**
 * Symlinks the main checkout's env files into a new task worktree and returns
 * their names. `git worktree add` checks out tracked files only, so without
 * this a task worktree starts with no secrets.
 *
 * Links only root-level files git ignores and doesn't track: a link to
 * anything else would show up as untracked in the worktree and could be
 * committed. Links are relative, so they survive the project folder moving.
 */
export async function linkEnvFiles(mainPath: string, worktreePath: string): Promise<string[]> {
	const output = await run(
		'git',
		['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...ENV_PATHSPECS],
		mainPath
	);
	// Pathspec globs cross `/`, so `.env.*` also matches files inside a `.env.d/`.
	const names = output.split('\0').filter((path) => path !== '' && !path.includes('/'));
	const target = relative(worktreePath, mainPath);
	for (const name of names) symlinkSync(join(target, name), join(worktreePath, name));
	return names;
}
