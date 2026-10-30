import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findUnpushedWork } from './install.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function commit(cwd: string, file: string, message: string): void {
	writeFileSync(join(cwd, file), `${message}\n`);
	git(cwd, 'add', file);
	git(cwd, 'commit', '--quiet', '-m', message);
}

/** Every ref in the repository, stash included, so a write would show as a diff. */
function refs(cwd: string): string {
	return git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)');
}

/** The one line naming `needle`; fails if there are none or several. */
function lineFor(lines: string[], needle: string): string {
	const matches = lines.filter((line) => line.includes(needle));
	expect(matches, `one line naming ${needle} in ${JSON.stringify(lines)}`).toHaveLength(1);
	return matches[0] as string;
}

/**
 * A container with `origin.git`, a `main/` clone (the original repository), and
 * a `feat-w/` sibling worktree on a pushed branch. Both checkouts hold a
 * git-ignored file, which is never work origin lacks.
 */
describe('findUnpushedWork', () => {
	let container: string;
	let main: string;
	let worktree: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-unpushed-')));
		const origin = join(container, 'origin.git');
		main = join(container, 'main');
		worktree = join(container, 'feat-w');
		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		git(container, 'clone', '--quiet', origin, main);
		writeFileSync(join(main, '.gitignore'), '*.log\n');
		git(main, 'add', '.gitignore');
		commit(main, 'README.md', 'init');
		git(main, 'push', '--quiet', '-u', 'origin', 'main');

		git(main, 'worktree', 'add', '--quiet', worktree, '-b', 'feat/w', 'origin/main');
		commit(worktree, 'w.txt', 'feat w');
		git(worktree, 'push', '--quiet', '-u', 'origin', 'feat/w');

		writeFileSync(join(main, 'debug.log'), 'ignored\n');
		writeFileSync(join(worktree, 'debug.log'), 'ignored\n');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('lists each piece of work origin lacks before cloning, and nothing when everything is on origin', async () => {
		expect(await findUnpushedWork(main)).toEqual([]);

		// Never pushed, but merged into main and main pushed: origin/main reaches it.
		git(main, 'switch', '--quiet', '-c', 'topic-merged');
		commit(main, 'merged.txt', 'merged');
		git(main, 'switch', '--quiet', 'main');
		git(main, 'merge', '--quiet', '--ff-only', 'topic-merged');
		git(main, 'push', '--quiet', 'origin', 'main');

		// Never pushed: two commits.
		git(main, 'switch', '--quiet', '-c', 'topic-unpushed');
		commit(main, 'unpushed-1.txt', 'unpushed 1');
		commit(main, 'unpushed-2.txt', 'unpushed 2');
		git(main, 'switch', '--quiet', 'main');

		// Pushed, then one more commit on top.
		git(main, 'switch', '--quiet', '-c', 'topic-ahead');
		commit(main, 'ahead-1.txt', 'ahead 1');
		git(main, 'push', '--quiet', '-u', 'origin', 'topic-ahead');
		commit(main, 'ahead-2.txt', 'ahead 2');
		git(main, 'switch', '--quiet', 'main');

		// Pushed with three unmerged commits, then deleted on origin.
		git(main, 'switch', '--quiet', '-c', 'topic-gone');
		commit(main, 'gone-1.txt', 'gone 1');
		commit(main, 'gone-2.txt', 'gone 2');
		commit(main, 'gone-3.txt', 'gone 3');
		git(main, 'push', '--quiet', '-u', 'origin', 'topic-gone');
		git(main, 'switch', '--quiet', 'main');
		git(main, 'push', '--quiet', 'origin', '--delete', 'topic-gone');

		// Two stashes, which should still read as one line.
		writeFileSync(join(main, 'README.md'), 'stashed once\n');
		git(main, 'stash', 'push', '--quiet', '-m', 'first');
		writeFileSync(join(main, 'README.md'), 'stashed twice\n');
		git(main, 'stash', 'push', '--quiet', '-m', 'second');

		// Uncommitted: a tracked edit in the main checkout, an untracked file in the worktree.
		writeFileSync(join(main, 'README.md'), 'edited\n');
		writeFileSync(join(worktree, 'scratch.txt'), 'untracked\n');

		const before = refs(main);
		const lines = await findUnpushedWork(main);

		expect(lineFor(lines, main)).toBeDefined();
		expect(lineFor(lines, worktree)).toBeDefined();
		expect(lines.filter((line) => /stash/i.test(line))).toHaveLength(1);
		expect(lineFor(lines, 'topic-unpushed')).toMatch(/\b2\b/);
		expect(lineFor(lines, 'topic-ahead')).toMatch(/\b1\b/);
		expect(lineFor(lines, 'topic-gone')).toMatch(/\b3\b/);
		expect(lines.some((line) => line.includes('topic-merged'))).toBe(false);
		expect(lines).toHaveLength(6);

		expect(refs(main)).toBe(before);
	});
});
