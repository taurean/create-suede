import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { install } from './install.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function write(path: string, content: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, content);
}

/**
 * A container with `origin.git` (whose `main` has a `package.json`), the
 * developer's existing checkout at `source/`, a suede `template/`, and a
 * destination `widget/main/` that is already occupied by something else.
 */
describe('install destination', () => {
	let container: string;
	let origin: string;
	let source: string;
	let template: string;
	let projectDir: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-install-dest-')));
		origin = join(container, 'origin.git');
		source = join(container, 'source');
		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		git(container, 'clone', '--quiet', origin, source);
		writeFileSync(join(source, 'package.json'), '{ "name": "widget", "version": "1.0.0" }\n');
		git(source, 'add', 'package.json');
		git(source, 'commit', '--quiet', '-m', 'init');
		git(source, 'push', '--quiet', 'origin', 'main');

		template = join(container, 'template');
		for (const skill of ['task', 'review', 'project-plan', 'orient']) {
			write(join(template, '.claude', 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
		}
		write(join(template, '.claude', 'agents', 'spec-reviewer.md'), '# spec-reviewer\n');
		write(join(template, 'CLAUDE.md'), '# CLAUDE.md\n');

		projectDir = join(container, 'widget', 'main');
		write(join(projectDir, 'notes.txt'), 'already here\n');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('stops before cloning and names the path when <container>/<name>/main already exists', async () => {
		const sourceWorktreesBefore = git(source, 'worktree', 'list');

		await expect(
			install({
				source,
				origin,
				projectDir,
				template,
				tag: 'v1.0.0',
				versioning: 'semver',
				css: false
			})
		).rejects.toThrow(projectDir);

		expect(readdirSync(projectDir)).toEqual(['notes.txt']);
		expect(readFileSync(join(projectDir, 'notes.txt'), 'utf8')).toBe('already here\n');
		expect(existsSync(join(container, 'widget', 'chore-suede-install'))).toBe(false);
		expect(readdirSync(join(container, 'widget'))).toEqual(['main']);
		expect(git(source, 'worktree', 'list')).toBe(sourceWorktreesBefore);
		expect(git(source, 'status', '--porcelain')).toBe('');
	});
});
