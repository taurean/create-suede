import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
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

function write(path: string, contents: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
}

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

const PROCESS_SKILLS = ['task', 'review', 'project-plan', 'orient'];
const CSS_SKILLS = ['design', 'writing-css'];
const AGENTS = ['standards-reviewer.md', 'spec-reviewer.md', 'story-test-writer.md'];

/**
 * A container with `origin.git` (main holds a package.json), the developer's
 * existing checkout `old/project/` cloned from it, and `suede/` standing in
 * for suede's tracked files at a tag, including the CSS skills.
 */
describe('install with css', () => {
	let container: string;
	let origin: string;
	let source: string;
	let template: string;
	let projectDir: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-install-css-')));
		origin = join(container, 'origin.git');
		source = join(container, 'old', 'project');
		template = join(container, 'suede');
		projectDir = join(container, 'developer', 'project', 'main');

		git(container, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
		mkdirSync(dirname(source), { recursive: true });
		git(container, 'clone', '--quiet', origin, source);
		write(
			join(source, 'package.json'),
			JSON.stringify({ name: 'project', version: '1.0.0' }, null, '\t') + '\n'
		);
		git(source, 'add', '.');
		git(source, 'commit', '--quiet', '-m', 'init');
		git(source, 'push', '--quiet', 'origin', 'main');

		for (const skill of [...PROCESS_SKILLS, ...CSS_SKILLS, 'suede-kickoff']) {
			write(join(template, '.claude', 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
		}
		write(join(template, '.claude', 'skills', 'task', 'brief.md'), '# brief\n');
		write(join(template, '.claude', 'skills', 'design', 'tokens.md'), '# tokens\n');
		write(join(template, '.claude', 'skills', 'writing-css', 'layers.md'), '# layers\n');
		for (const agent of AGENTS) {
			write(join(template, '.claude', 'agents', agent), `# ${agent}\n`);
		}
		write(join(template, 'CLAUDE.md'), '# suede CLAUDE.md\n');
		write(join(template, 'package.json'), JSON.stringify({ name: 'suede' }) + '\n');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('a developer who answers yes to CSS sees the design and writing-css skills in the install worktree alongside the process layer', async () => {
		const report = await install({
			source,
			origin,
			projectDir,
			template,
			tag: '2026.10.28.2',
			versioning: 'chronver',
			css: true
		});

		const skills = join(report.worktree, '.claude', 'skills');

		// The CSS skills, whole directories.
		for (const skill of CSS_SKILLS) {
			expect(read(join(skills, skill, 'SKILL.md'))).toBe(`# ${skill}\n`);
		}
		expect(read(join(skills, 'design', 'tokens.md'))).toBe('# tokens\n');
		expect(read(join(skills, 'writing-css', 'layers.md'))).toBe('# layers\n');

		// Alongside the process layer, still whole.
		for (const skill of PROCESS_SKILLS) {
			expect(read(join(skills, skill, 'SKILL.md'))).toBe(`# ${skill}\n`);
		}
		expect(read(join(skills, 'task', 'brief.md'))).toBe('# brief\n');

		// Exactly those: answering yes doesn't pull in the rest of suede's skills.
		expect(readdirSync(skills).sort()).toEqual([...PROCESS_SKILLS, ...CSS_SKILLS].sort());

		// Staged uncommitted in the worktree, like the rest of the install.
		const status = git(report.worktree, 'status', '--porcelain', '--untracked-files=all');
		for (const skill of CSS_SKILLS) {
			expect(status).toContain(`?? .claude/skills/${skill}/SKILL.md`);
		}
	});
});
