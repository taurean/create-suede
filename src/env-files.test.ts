import { execFileSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkEnvFiles } from './env-files.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function write(root: string, path: string, content: string): void {
	writeFileSync(join(root, path), content);
}

/**
 * A sibling layout like the one `suede task` builds: `main` is the
 * repository's main checkout, and `task` is a `git worktree add` of it.
 */
describe('linkEnvFiles', () => {
	let container: string;
	let main: string;
	let worktree: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-env-files-')));
		main = join(container, 'main');
		worktree = join(container, 'task');
		mkdirSync(main);

		git(main, 'init', '--quiet');
		git(main, 'config', 'user.name', 'Story Test');
		git(main, 'config', 'user.email', 'story-test@example.com');
		git(main, 'config', 'commit.gpgsign', 'false');

		write(main, '.gitignore', '.env\n.env.local\n.dev.vars\nsecrets.json\n');
		write(main, '.env.example', 'API_KEY=\n');
		git(main, 'add', '.gitignore', '.env.example');
		git(main, 'commit', '--quiet', '-m', 'initial');

		write(main, '.env', 'API_KEY=main\n');
		write(main, '.env.local', 'LOCAL=main\n');
		write(main, '.dev.vars', 'DEV_VAR=main\n');
		write(main, '.env.test', 'TEST=main\n');
		write(main, 'secrets.json', '{"token":"main"}\n');

		git(main, 'worktree', 'add', '--quiet', '-b', 'feat/story', worktree);
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('links only the ignored env files into a new worktree, not other ignored files, as relative symlinks, leaving git status clean', async () => {
		const ignored = ['.dev.vars', '.env', '.env.local'];

		const linked = await linkEnvFiles(main, worktree);

		expect([...linked].sort()).toEqual(ignored);

		for (const name of ignored) {
			const link = join(worktree, name);
			expect(lstatSync(link).isSymbolicLink()).toBe(true);
			expect(isAbsolute(readlinkSync(link))).toBe(false);
			expect(realpathSync(link)).toBe(join(main, name));
			expect(readFileSync(link, 'utf8')).toBe(readFileSync(join(main, name), 'utf8'));
		}

		// The tracked example is the worktree's own checked-out copy, not a link.
		expect(lstatSync(join(worktree, '.env.example')).isSymbolicLink()).toBe(false);
		// The untracked but un-ignored file is left alone.
		expect(existsSync(join(worktree, '.env.test'))).toBe(false);
		// An ignored file without an env name is left alone too.
		expect(existsSync(join(worktree, 'secrets.json'))).toBe(false);

		expect(git(worktree, 'status', '--porcelain', '--untracked-files=all')).toBe('');
	});
});
