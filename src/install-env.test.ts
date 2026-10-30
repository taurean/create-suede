import { execFileSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { install } from './install.ts';

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

function write(root: string, path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
}

/**
 * A container with `origin.git`, the developer's original checkout `source/`
 * (a clone of origin holding ignored env files), a `template/` holding suede at
 * the tag, and a not-yet-existing `app/main` as the new project directory.
 */
describe('install', () => {
	let container: string;
	let origin: string;
	let source: string;
	let template: string;
	let projectDir: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-install-env-')));
		origin = join(container, 'origin.git');
		source = join(container, 'source');
		template = join(container, 'template');
		projectDir = join(container, 'app', 'main');

		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		git(container, 'clone', '--quiet', origin, source);
		git(source, 'config', 'commit.gpgsign', 'false');
		write(source, 'package.json', '{\n\t"name": "app",\n\t"version": "1.0.0"\n}\n');
		write(source, '.gitignore', 'node_modules\n.env\n.env.local\n.dev.vars\n.env.d/\n');
		write(source, '.env.example', 'API_KEY=\n');
		git(source, 'add', 'package.json', '.gitignore', '.env.example');
		git(source, 'commit', '--quiet', '-m', 'init');
		git(source, 'push', '--quiet', 'origin', 'main');

		// Root-level, ignored, untracked: these are the env files.
		write(source, '.env', 'API_KEY=source\n');
		write(source, '.env.local', 'LOCAL=source\n');
		write(source, '.dev.vars', 'DEV_VAR=source\n');
		// Untracked but not ignored: not an env file to carry over.
		write(source, '.env.test', 'TEST=source\n');
		// Ignored, but not at the root.
		write(source, '.env.d/.env', 'NESTED=source\n');

		for (const skill of ['task', 'review', 'project-plan', 'orient']) {
			write(template, `.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`);
		}
		write(template, '.claude/agents/spec-reviewer.md', '# spec-reviewer\n');
		write(template, 'CLAUDE.md', '# CLAUDE.md\n');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it("copies the original checkout's ignored env files into the new main, links them into the install worktree, and lists them", async () => {
		const envFiles = ['.dev.vars', '.env', '.env.local'];

		const report = await install({
			source,
			origin,
			projectDir,
			template,
			tag: '1.0.0',
			versioning: 'semver',
			css: false
		});

		expect([...report.envFiles].sort()).toEqual(envFiles);

		for (const name of envFiles) {
			const original = readFileSync(join(source, name), 'utf8');

			// A real copy in the new main checkout, not a link back to the source.
			const copy = join(projectDir, name);
			expect(lstatSync(copy).isSymbolicLink()).toBe(false);
			expect(lstatSync(copy).isFile()).toBe(true);
			expect(readFileSync(copy, 'utf8')).toBe(original);

			// A link in the install worktree that resolves to the new main's copy.
			const link = join(report.worktree, name);
			expect(lstatSync(link).isSymbolicLink()).toBe(true);
			expect(realpathSync(link)).toBe(copy);
			expect(readFileSync(link, 'utf8')).toBe(original);
		}

		// Files that aren't root-level ignored env files stay behind.
		expect(existsSync(join(projectDir, '.env.test'))).toBe(false);
		expect(existsSync(join(projectDir, '.env.d'))).toBe(false);
		expect(existsSync(join(report.worktree, '.env.test'))).toBe(false);
		expect(existsSync(join(report.worktree, '.env.d'))).toBe(false);
		// The tracked example arrives through the clone, as an ordinary file.
		expect(lstatSync(join(projectDir, '.env.example')).isSymbolicLink()).toBe(false);
		expect(lstatSync(join(report.worktree, '.env.example')).isSymbolicLink()).toBe(false);

		// The source is read, never written.
		for (const name of envFiles) {
			expect(lstatSync(join(source, name)).isSymbolicLink()).toBe(false);
		}
	});
});
