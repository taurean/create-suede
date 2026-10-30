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
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { install, INSTALL_BRANCH, SUEDE_CLAUDE_MD } from './install.ts';

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

/** Every file under `dir`, relative to it, skipping `.git`. */
function listFiles(dir: string, prefix = ''): string[] {
	return readdirSync(join(dir, prefix), { withFileTypes: true })
		.filter((entry) => entry.name !== '.git')
		.flatMap((entry) => {
			const relative = prefix ? join(prefix, entry.name) : entry.name;
			return entry.isDirectory() ? listFiles(dir, relative) : [relative];
		})
		.sort();
}

const PROCESS_SKILLS = ['task', 'review', 'project-plan', 'orient'];
const OTHER_SKILLS = ['design', 'writing-css', 'suede-kickoff'];
const AGENTS = ['standards-reviewer.md', 'spec-reviewer.md', 'story-test-writer.md'];

/**
 * A container with `origin.git` (main holds a package.json), the developer's
 * existing checkout `old/project/` cloned from it with some local untracked
 * work, and `suede/` standing in for suede's tracked files at a tag.
 */
describe('install', () => {
	let container: string;
	let origin: string;
	let source: string;
	let template: string;
	let projectDir: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-install-')));
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
		write(join(source, 'README.md'), 'project\n');
		git(source, 'add', '.');
		git(source, 'commit', '--quiet', '-m', 'init');
		git(source, 'push', '--quiet', 'origin', 'main');
		write(join(source, 'notes.txt'), 'local work in progress\n');

		for (const skill of [...PROCESS_SKILLS, ...OTHER_SKILLS]) {
			write(join(template, '.claude', 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
		}
		write(join(template, '.claude', 'skills', 'task', 'brief.md'), '# brief\n');
		for (const agent of AGENTS) {
			write(join(template, '.claude', 'agents', agent), `# ${agent}\n`);
		}
		write(join(template, 'CLAUDE.md'), '# suede CLAUDE.md\n');
		write(join(template, 'package.json'), JSON.stringify({ name: 'suede' }) + '\n');
		write(join(template, 'src', 'routes', '+page.svelte'), '<h1>suede</h1>\n');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it('clones origin into <container>/<repo>/main and stages suede in an uncommitted chore/suede-install worktree beside it, leaving the original checkout unchanged', async () => {
		const sourceStatusBefore = git(source, 'status', '--porcelain');
		const sourceHeadBefore = git(source, 'rev-parse', 'HEAD');
		const sourceFilesBefore = listFiles(source);
		const sourcePackageBefore = read(join(source, 'package.json'));
		const originMain = git(source, 'rev-parse', 'origin/main');

		const report = await install({
			source,
			origin,
			projectDir,
			template,
			tag: '2026.10.28.2',
			versioning: 'chronver'
		});

		// <container>/<repo>/main, cloned from origin, on main.
		expect(report.cloned).toBe(true);
		expect(git(projectDir, 'remote', 'get-url', 'origin')).toBe(origin);
		expect(git(projectDir, 'branch', '--show-current')).toBe('main');
		expect(git(projectDir, 'rev-parse', 'HEAD')).toBe(originMain);

		// The chore/suede-install worktree is a sibling of main, off origin/main.
		const worktree = join(container, 'developer', 'project', 'chore-suede-install');
		expect(report.worktree).toBe(worktree);
		expect(git(projectDir, 'worktree', 'list', '--porcelain')).toContain(`worktree ${worktree}`);
		expect(git(worktree, 'branch', '--show-current')).toBe(INSTALL_BRANCH);
		expect(git(worktree, 'rev-parse', 'HEAD')).toBe(originMain);

		// The four process skills, whole directories.
		for (const skill of PROCESS_SKILLS) {
			expect(read(join(worktree, '.claude', 'skills', skill, 'SKILL.md'))).toBe(`# ${skill}\n`);
		}
		expect(read(join(worktree, '.claude', 'skills', 'task', 'brief.md'))).toBe('# brief\n');
		// And no others.
		expect(readdirSync(join(worktree, '.claude', 'skills')).sort()).toEqual(
			[...PROCESS_SKILLS].sort()
		);

		// Every agent.
		expect(readdirSync(join(worktree, '.claude', 'agents')).sort()).toEqual([...AGENTS].sort());
		for (const agent of AGENTS) {
			expect(read(join(worktree, '.claude', 'agents', agent))).toBe(`# ${agent}\n`);
		}

		// suede's CLAUDE.md lands beside the project's, not over it.
		expect(read(join(worktree, SUEDE_CLAUDE_MD))).toBe('# suede CLAUDE.md\n');
		expect(existsSync(join(worktree, 'CLAUDE.md'))).toBe(false);

		// Lineage in package.json, the project's own fields kept.
		const pkg = JSON.parse(read(join(worktree, 'package.json')));
		expect(pkg).toMatchObject({ name: 'project', version: '1.0.0' });
		expect(pkg.suede).toEqual({ from: '2026.10.28.2', versioning: 'chronver' });

		// Nothing else from the template leaked in.
		expect(existsSync(join(worktree, 'src', 'routes', '+page.svelte'))).toBe(false);

		// All of it uncommitted.
		const status = git(worktree, 'status', '--porcelain', '--untracked-files=all');
		expect(git(worktree, 'diff', '--name-only')).toBe('package.json');
		expect(status).toContain(`?? ${SUEDE_CLAUDE_MD}`);
		for (const skill of PROCESS_SKILLS) {
			expect(status).toContain(`?? .claude/skills/${skill}/SKILL.md`);
		}
		for (const agent of AGENTS) {
			expect(status).toContain(`?? .claude/agents/${agent}`);
		}

		// The original checkout is untouched.
		expect(git(source, 'status', '--porcelain')).toBe(sourceStatusBefore);
		expect(git(source, 'rev-parse', 'HEAD')).toBe(sourceHeadBefore);
		expect(listFiles(source)).toEqual(sourceFilesBefore);
		expect(read(join(source, 'package.json'))).toBe(sourcePackageBefore);
	});
});
