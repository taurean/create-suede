import {
	existsSync,
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
import { applyUpdate, replaceSuedeFrom } from './update.ts';

const SKILL = '.claude/skills/task/SKILL.md';
const AGENT = '.claude/agents/spec-reviewer.md';

function write(root: string, path: string, content: string): void {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function read(root: string, path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

/** Ten numbered lines, with any line replaced by index (0-based). */
function lines(overrides: Record<number, string> = {}): string {
	return (
		Array.from({ length: 10 }, (_, index) => overrides[index] ?? `line ${index + 1}`).join('\n') +
		'\n'
	);
}

/**
 * Three plain directories: `base` is suede at the project's `suede.from` tag,
 * `theirs` is suede at the latest tag, and `project` is the checkout being
 * updated in place.
 */
describe('applyUpdate', () => {
	let container: string;
	let base: string;
	let theirs: string;
	let project: string;

	beforeEach(() => {
		container = realpathSync(mkdtempSync(join(tmpdir(), 'suede-update-')));
		base = join(container, 'base');
		theirs = join(container, 'theirs');
		project = join(container, 'project');
	});

	afterEach(() => rmSync(container, { recursive: true, force: true }));

	it("keeps the project's edits and carries suede's into skill and agent files", async () => {
		for (const path of [SKILL, AGENT]) {
			write(base, path, lines());
			write(project, path, lines({ 1: `project edit in ${path}` }));
			write(theirs, path, lines({ 8: `suede edit in ${path}` }));
		}

		const report = await applyUpdate({ base, theirs, project });

		for (const path of [SKILL, AGENT]) {
			expect(read(project, path)).toBe(
				lines({ 1: `project edit in ${path}`, 8: `suede edit in ${path}` })
			);
		}
		expect([...report.merged].sort()).toEqual([AGENT, SKILL]);
		expect(report.conflicted).toEqual([]);
	});

	it('leaves conflict markers and lists the file as conflicted when edits overlap', async () => {
		write(base, SKILL, lines());
		write(project, SKILL, lines({ 4: 'project wording' }));
		write(theirs, SKILL, lines({ 4: 'suede wording' }));

		const report = await applyUpdate({ base, theirs, project });

		const merged = read(project, SKILL);
		expect(merged).toMatch(/^<<<<<<< /m);
		expect(merged).toMatch(/^=======$/m);
		expect(merged).toMatch(/^>>>>>>> /m);
		expect(merged).toContain('project wording');
		expect(merged).toContain('suede wording');
		expect(merged.indexOf('project wording')).toBeLessThan(merged.indexOf('=======\n'));
		expect(merged.indexOf('suede wording')).toBeGreaterThan(merged.indexOf('=======\n'));
		expect(report.conflicted).toEqual([SKILL]);
		expect(report.merged).not.toContain(SKILL);
	});

	it('adds a skill suede added and removes an agent suede removed that the project had not edited', async () => {
		const addedSkill = '.claude/skills/ship/SKILL.md';
		const removedAgent = '.claude/agents/old-reviewer.md';
		write(base, removedAgent, lines());
		write(project, removedAgent, lines());
		write(theirs, addedSkill, lines({ 0: '# ship' }));

		const report = await applyUpdate({ base, theirs, project });

		expect(read(project, addedSkill)).toBe(lines({ 0: '# ship' }));
		expect(existsSync(join(project, removedAgent))).toBe(false);
		expect(report.added).toEqual([addedSkill]);
		expect(report.removed).toEqual([removedAgent]);
		expect(report.conflicted).toEqual([]);
		expect(report.keptOverRemoval).toEqual([]);
	});

	it('keeps a file suede removed when the project had edited it, untouched', async () => {
		const edited = lines({ 3: 'project addition' });
		write(base, AGENT, lines());
		write(project, AGENT, edited);

		const report = await applyUpdate({ base, theirs, project });

		expect(read(project, AGENT)).toBe(edited);
		expect(report.keptOverRemoval).toEqual([AGENT]);
		expect(report.removed).not.toContain(AGENT);
	});

	it('leaves out a skill directory and an agent file the project deleted and suede changed since, listing each once', async () => {
		const skillDirectory = '.claude/skills/retired/';
		const agent = '.claude/agents/retired.md';
		write(base, `${skillDirectory}SKILL.md`, lines());
		write(theirs, `${skillDirectory}SKILL.md`, lines({ 6: 'suede edit' }));
		write(theirs, `${skillDirectory}notes.md`, lines({ 0: '# notes' }));
		write(base, agent, lines());
		write(theirs, agent, lines({ 2: 'suede edit' }));
		// The project has neither: it deleted both before this update.
		mkdirSync(join(project, '.claude/skills'), { recursive: true });
		mkdirSync(join(project, '.claude/agents'), { recursive: true });

		const report = await applyUpdate({ base, theirs, project });

		expect(existsSync(join(project, skillDirectory))).toBe(false);
		expect(existsSync(join(project, agent))).toBe(false);
		expect([...report.leftOut].sort()).toEqual([agent, skillDirectory]);
		expect(report.added).toEqual([]);
		expect(report.merged).toEqual([]);
		expect(report.conflicted).toEqual([]);
	});

	it("adds components suede added, keeps out ones the project deleted, and leaves the project's components unchanged", async () => {
		const added = 'src/lib/components/Badge.svelte';
		const deleted = 'src/lib/components/Card.svelte';
		const kept = 'src/lib/components/Button.svelte';
		write(theirs, added, lines({ 0: '<script>badge</script>' }));
		write(base, deleted, lines());
		write(theirs, deleted, lines({ 4: 'suede edit' }));
		write(base, kept, lines());
		write(theirs, kept, lines({ 4: 'suede edit' }));
		const ownButton = lines({ 7: 'project edit' });
		write(project, kept, ownButton);

		const report = await applyUpdate({ base, theirs, project });

		expect(read(project, added)).toBe(lines({ 0: '<script>badge</script>' }));
		expect(existsSync(join(project, deleted))).toBe(false);
		expect(read(project, kept)).toBe(ownButton);
		expect(report.added).toEqual([added]);
		expect(report.leftOut).toEqual([deleted]);
		expect(report.merged).toEqual([]);
		expect(report.conflicted).toEqual([]);
		expect(report.removed).toEqual([]);
		expect(report.keptOverRemoval).toEqual([]);
	});
});

describe('replaceSuedeFrom', () => {
	it('bumps suede.from to the latest tag and leaves the rest of package.json byte-for-byte', () => {
		const source = [
			'{',
			'\t"name": "my-project",',
			'\t"version": "1.4.2",',
			'\t"private": true,',
			'\t"type": "module",',
			'\t"scripts": {',
			'\t\t"test": "vitest run",',
			'\t\t"build": "tsdown"',
			'\t},',
			'\t"suede": {',
			'\t\t"from": "0.6.0",',
			'\t\t"versioning": "semver"',
			'\t},',
			'\t"devDependencies": {',
			'\t\t"vitest": "^3.2.0"',
			'\t}',
			'}',
			''
		].join('\n');

		const updated = replaceSuedeFrom(source, '0.6.0', '0.8.0');

		expect(updated).toBe(source.replace('\t\t"from": "0.6.0",', '\t\t"from": "0.8.0",'));
	});
});
