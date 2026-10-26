import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeWorktrees } from './worktree.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function branchExists(cwd: string, branch: string): boolean {
	try {
		git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * A container with `origin.git`, a `main/` clone, and a `fix-a/` task worktree
 * whose branch was pushed, then merged on origin with a merge commit and pulled
 * into the branch, leaving it one commit ahead of its stale upstream. This is the
 * state from taurean/create-suede#13, where `git branch -d` refused the branch.
 */
describe('removeWorktrees', () => {
	let container: string;
	let main: string;
	let task: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-remove-')));
		const origin = join(container, 'origin.git');
		main = join(container, 'main');
		task = join(container, 'fix-a');
		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		git(container, 'clone', '--quiet', origin, main);
		writeFileSync(join(main, 'README.md'), 'init\n');
		git(main, 'add', 'README.md');
		git(main, 'commit', '--quiet', '-m', 'init');
		git(main, 'push', '--quiet', 'origin', 'main');

		git(main, 'worktree', 'add', '--quiet', task, '-b', 'fix/a', 'origin/main');
		writeFileSync(join(task, 'a.txt'), 'a\n');
		git(task, 'add', 'a.txt');
		git(task, 'commit', '--quiet', '-m', 'fix a');
		git(task, 'push', '--quiet', '-u', 'origin', 'fix/a');

		// The PR merge, made on origin's side: a merge commit main/ hasn't pulled.
		const merger = join(container, 'merger');
		git(container, 'clone', '--quiet', origin, merger);
		git(merger, 'merge', '--quiet', '--no-ff', '-m', 'Merge fix/a', 'origin/fix/a');
		git(merger, 'push', '--quiet', 'origin', 'main');
		git(main, 'fetch', '--quiet', 'origin');
		git(task, 'merge', '--quiet', '--ff-only', 'origin/main');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('deletes a merged branch whose upstream is behind its tip', async () => {
		expect(git(main, 'rev-list', '--count', 'origin/fix/a..fix/a')).toBe('1');
		expect(git(main, 'rev-list', '--count', 'fix/a..origin/main')).toBe('0');

		const result = await removeWorktrees(main, [{ path: task, branch: 'fix/a' }]);

		expect(result.failed).toEqual([]);
		expect(result.removed.map((worktree) => worktree.branch)).toEqual(['fix/a']);
		expect(branchExists(main, 'fix/a')).toBe(false);
		expect(git(main, 'worktree', 'list')).not.toContain(task);
	});

	it('reports a failed removal and carries on with the rest', async () => {
		const other = join(container, 'fix-b');
		git(main, 'worktree', 'add', '--quiet', other, '-b', 'fix/b', 'origin/main');
		git(main, 'worktree', 'lock', task);

		const result = await removeWorktrees(main, [
			{ path: task, branch: 'fix/a' },
			{ path: other, branch: 'fix/b' }
		]);

		expect(result.removed.map((worktree) => worktree.branch)).toEqual(['fix/b']);
		expect(result.failed.map(({ worktree }) => worktree.branch)).toEqual(['fix/a']);
		expect(result.failed[0]?.error).toMatch(/git worktree remove/);
		expect(branchExists(main, 'fix/a')).toBe(true);
		expect(branchExists(main, 'fix/b')).toBe(false);
	});
});
