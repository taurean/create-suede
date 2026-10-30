import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
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
 * A container with `origin.git`, the developer's checkout at `source/`, a suede
 * `template/`, and `outside/`, a directory a tracked symlink in origin points at.
 * Install must never write through a symlink it didn't create.
 */
describe('install and tracked symlinks', () => {
	let container: string;
	let origin: string;
	let source: string;
	let template: string;
	let outside: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-install-symlinks-')));
		origin = join(container, 'origin.git');
		source = join(container, 'source');
		outside = join(container, 'outside');
		mkdirSync(outside);
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
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	function pushSymlink(path: string, target: string): void {
		symlinkSync(target, join(source, path));
		git(source, 'add', path);
		git(source, 'commit', '--quiet', '-m', `track ${path}`);
		git(source, 'push', '--quiet', 'origin', 'main');
	}

	it('refuses to write suede files through a .claude directory origin tracks as a symlink', async () => {
		pushSymlink('.claude', outside);

		await expect(
			install({
				source,
				origin,
				projectDir: join(container, 'widget', 'main'),
				template,
				tag: '2026.10.28.2',
				versioning: 'semver'
			})
		).rejects.toThrow(/\.claude.*symlink/);

		expect(readdirSync(outside)).toEqual([]);
	});

	it("refuses to copy an env file over one origin's main now tracks, instead of writing through it", async () => {
		// The developer's checkout predates origin tracking .env; they still have their own, ignored.
		const secret = join(outside, 'leaked');
		pushSymlink('.env', secret);
		git(source, 'reset', '--quiet', '--hard', 'HEAD~1');
		writeFileSync(join(source, '.gitignore'), '.env\n');
		writeFileSync(join(source, '.env'), 'SECRET=1\n');

		await expect(
			install({
				source,
				origin,
				projectDir: join(container, 'widget', 'main'),
				template,
				tag: '2026.10.28.2',
				versioning: 'semver'
			})
		).rejects.toThrow(/\.env/);

		expect(readdirSync(outside)).toEqual([]);
		expect(readFileSync(join(source, '.env'), 'utf8')).toBe('SECRET=1\n');
	});
});
