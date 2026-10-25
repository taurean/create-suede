import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGitRoot, findProjectRoot } from './project.ts';
import { listWorktrees } from './worktree.ts';

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
		cwd,
		stdio: 'ignore'
	});
}

/** A container in the sibling layout: `main/` plus a `feat-login/` task worktree. No suede.from. */
describe('root resolution in a plain git repo with sibling worktrees', () => {
	let container: string;
	let main: string;
	let task: string;

	beforeAll(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-project-')));
		main = join(container, 'main');
		task = join(container, 'feat-login');
		mkdirSync(join(main, 'src'), { recursive: true });
		writeFileSync(join(main, 'package.json'), '{ "name": "plain" }\n');
		git(main, 'init', '--quiet', '--initial-branch=main');
		git(main, 'add', 'package.json');
		git(main, 'commit', '--quiet', '-m', 'init');
		git(main, 'worktree', 'add', '--quiet', task, '-b', 'feat/login');
		mkdirSync(join(task, 'src', 'deep'), { recursive: true });
	});

	afterAll(() => rmSync(container, { recursive: true, force: true }));

	it('finds the main checkout from inside main/', async () => {
		const root = findGitRoot(join(main, 'src'));
		expect(root).toBe(main);
		expect((await listWorktrees(root!))[0]?.path).toBe(main);
	});

	it('finds the main checkout from inside a task worktree', async () => {
		const root = findGitRoot(join(task, 'src', 'deep'));
		expect(root).toBe(task);
		expect((await listWorktrees(root!))[0]?.path).toBe(main);
	});

	it('keeps the suede.from gate shut for task and release', () => {
		expect(findProjectRoot(main)).toBeUndefined();
		expect(findProjectRoot(task)).toBeUndefined();
	});

	it('finds nothing outside a git repository', () => {
		expect(findGitRoot(container)).toBeUndefined();
	});
});
