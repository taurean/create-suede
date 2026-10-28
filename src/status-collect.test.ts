import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectStatus, type StatusReport, type TaskWorktree } from './status.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function isAncestor(cwd: string, commit: string, of: string): boolean {
	try {
		git(cwd, 'merge-base', '--is-ancestor', commit, of);
		return true;
	} catch {
		return false;
	}
}

function commitFile(cwd: string, file: string, message: string): void {
	writeFileSync(join(cwd, file), `${message}\n`);
	git(cwd, 'add', file);
	git(cwd, 'commit', '--quiet', '-m', message);
}

function taskAt(report: StatusReport, path: string): TaskWorktree {
	const task = report.tasks.find((worktree) => worktree.path === path);
	if (!task) throw new Error(`no task worktree at ${path} in ${JSON.stringify(report)}`);
	return task;
}

/**
 * A container with `origin.git`, a `main/` clone, and four task worktrees:
 * - `fix-a/` committed and pushed, then merged on origin's side by a separate clone
 *   after main/ last fetched, so only a fresh fetch can see the merge.
 * - `fix-b/` committed and pushed, never merged.
 * - `fix-c/` a fresh branch still at its start point.
 * - `fix-d/` a fresh branch with an uncommitted change to a tracked file.
 */
describe('collectStatus', () => {
	let container: string;
	let merger: string;
	let main: string;
	let merged: string;
	let unmerged: string;
	let fresh: string;
	let dirty: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-status-')));
		merger = realpathSync(mkdtempSync(join(tmpdir(), 'suede-status-merger-')));
		const origin = join(container, 'origin.git');
		main = join(container, 'main');
		merged = join(container, 'fix-a');
		unmerged = join(container, 'fix-b');
		fresh = join(container, 'fix-c');
		dirty = join(container, 'fix-d');

		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		git(container, 'clone', '--quiet', origin, main);
		commitFile(main, 'README.md', 'init');
		git(main, 'push', '--quiet', 'origin', 'main');

		git(main, 'worktree', 'add', '--quiet', merged, '-b', 'fix/a', 'origin/main');
		commitFile(merged, 'a.txt', 'fix a');
		git(merged, 'push', '--quiet', '-u', 'origin', 'fix/a');

		git(main, 'worktree', 'add', '--quiet', unmerged, '-b', 'fix/b', 'origin/main');
		commitFile(unmerged, 'b.txt', 'fix b');
		git(unmerged, 'push', '--quiet', '-u', 'origin', 'fix/b');

		git(main, 'worktree', 'add', '--quiet', fresh, '-b', 'fix/c', 'origin/main');

		git(main, 'worktree', 'add', '--quiet', dirty, '-b', 'fix/d', 'origin/main');
		writeFileSync(join(dirty, 'README.md'), 'edited, not committed\n');

		// main/'s last fetch. Everything after this is invisible to it until it fetches again.
		git(main, 'fetch', '--quiet', 'origin');

		// The PR merge, made on origin's side by a separate clone.
		git(merger, 'clone', '--quiet', origin, 'clone');
		const clone = join(merger, 'clone');
		git(clone, 'merge', '--quiet', '--no-ff', '-m', 'Merge fix/a', 'origin/fix/a');
		git(clone, 'push', '--quiet', 'origin', 'main');
	});

	afterEach(() => {
		rmSync(container, { recursive: true, force: true });
		rmSync(merger, { recursive: true, force: true });
	});

	function expectGlance(report: StatusReport): void {
		expect(report.main).toBe(main);
		expect(report.tasks.map((task) => task.path).sort()).toEqual(
			[merged, unmerged, fresh, dirty].sort()
		);

		expect(taskAt(report, merged)).toMatchObject({ branch: 'fix/a', merged: true, dirty: false });
		expect(taskAt(report, unmerged)).toMatchObject({
			branch: 'fix/b',
			merged: false,
			dirty: false
		});
		expect(taskAt(report, fresh)).toMatchObject({ branch: 'fix/c', merged: false, dirty: false });
		expect(taskAt(report, dirty)).toMatchObject({ branch: 'fix/d', dirty: true, merged: false });
	}

	it('marks the branch merged on origin as ready for done, run from inside a task worktree', async () => {
		// Precondition: the merge happened after the last fetch, so the local view is stale.
		expect(isAncestor(main, 'fix/a', 'origin/main')).toBe(false);

		expectGlance(await collectStatus(unmerged));
	});

	it('marks the branch merged on origin as ready for done, run from the main checkout', async () => {
		expect(isAncestor(main, 'fix/a', 'origin/main')).toBe(false);

		expectGlance(await collectStatus(main));
	});
});
