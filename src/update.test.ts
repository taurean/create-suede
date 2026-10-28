import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
