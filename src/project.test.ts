import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGitRoot, findProjectRoot, usesPnpm } from './project.ts';
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

	it('keeps the suede.from gate shut for release', () => {
		expect(findProjectRoot(main)).toBeUndefined();
		expect(findProjectRoot(task)).toBeUndefined();
	});

	it('finds nothing outside a git repository', () => {
		expect(findGitRoot(container)).toBeUndefined();
	});
});

describe('usesPnpm', () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'suede-pnpm-'));
	});

	afterAll(() => rmSync(root, { recursive: true, force: true }));

	function checkout(name: string, files: Record<string, string>): string {
		const directory = join(root, name);
		mkdirSync(directory);
		for (const [file, content] of Object.entries(files))
			writeFileSync(join(directory, file), content);
		return directory;
	}

	it('accepts a pnpm-lock.yaml', () => {
		expect(usesPnpm(checkout('lock', { 'pnpm-lock.yaml': '', 'package.json': '{}' }))).toBe(true);
	});

	it('accepts a packageManager naming pnpm', () => {
		const manifest = JSON.stringify({ packageManager: 'pnpm@10.6.0' });
		expect(usesPnpm(checkout('field', { 'package.json': manifest }))).toBe(true);
	});

	it('refuses other package managers and repos without package.json', () => {
		const npm = JSON.stringify({ packageManager: 'npm@10.0.0' });
		expect(usesPnpm(checkout('npm', { 'package.json': npm, 'package-lock.json': '{}' }))).toBe(
			false
		);
		expect(usesPnpm(checkout('bare', { 'package.json': '{}' }))).toBe(false);
		expect(usesPnpm(checkout('none', {}))).toBe(false);
	});
});
