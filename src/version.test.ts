import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chronverTags } from './chronver.ts';
import type { Lookup } from './lookup.ts';
import { measureDrift, type Drift } from './template.ts';
import { formatVersionReport, runVersion, upgradeCommand, type VersionReport } from './version.ts';

vi.mock('./template.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('./template.ts')>()),
	fetchTemplateTags: async () =>
		chronverTags(['2026.10.21', '2026.10.26'].map((tag) => `abc\trefs/tags/${tag}`).join('\n'))
}));

const current: VersionReport = {
	installed: '0.7.1',
	npmLatest: { ok: true, value: '0.7.1' },
	suedeLatest: { ok: true, value: '2026.10.26' },
	project: undefined,
	upgradeCommand: 'volta install create-suede@latest'
};

describe('formatVersionReport', () => {
	it('prints the installed, npm, and suede versions', () => {
		const output = formatVersionReport(current);
		expect(output).toMatch(/create-suede\s+0\.7\.1/);
		expect(output).toMatch(/npm latest\s+0\.7\.1/);
		expect(output).toMatch(/suede latest\s+2026\.10\.26/);
	});

	it('names the upgrade command only when the install is behind npm', () => {
		expect(formatVersionReport(current)).not.toContain('Upgrade');
		expect(formatVersionReport({ ...current, installed: '0.7.0' })).toContain(
			"0.7.0 is behind npm's 0.7.1. Upgrade with volta install create-suede@latest"
		);
		expect(formatVersionReport({ ...current, installed: '0.8.0' })).not.toContain('Upgrade');
	});

	it('says so when the versions are not comparable', () => {
		expect(
			formatVersionReport({ ...current, npmLatest: { ok: true, value: '0.8.0-beta.1' } })
		).toContain("Can't compare 0.7.1 with npm's 0.8.0-beta.1: not plain semver.");
	});

	it('keeps the local version and names each unreachable source', () => {
		const output = formatVersionReport({
			...current,
			npmLatest: { ok: false, reason: 'registry.npmjs.org: fetch failed' },
			suedeLatest: { ok: false, reason: 'github.com/taurean/suede: timeout' }
		});
		expect(output).toMatch(/create-suede\s+0\.7\.1/);
		expect(output).toContain('unavailable: registry.npmjs.org: fetch failed');
		expect(output).toContain('unavailable: github.com/taurean/suede: timeout');
		expect(output).not.toContain('Upgrade');
	});

	it('shows how far suede.from is behind suede, that it is the latest, or why drift is unavailable', () => {
		const tags = chronverTags(
			['2026.9.30.1', '2026.10.17', '2026.10.21', '2026.10.21.1', '2026.10.26']
				.map((tag) => `abc\trefs/tags/${tag}`)
				.join('\n')
		);
		const fromRow = (output: string) =>
			output.split('\n').filter((line) => /^\s*suede\.from\b/.test(line));
		const withProject = (from: string, drift: Lookup<Drift>) =>
			formatVersionReport({ ...current, project: { from, drift } });

		expect(fromRow(formatVersionReport(current))).toEqual([]);

		const [behind] = fromRow(
			withProject('2026.9.30.1', { ok: true, value: measureDrift('2026.9.30.1', tags) })
		);
		expect(behind).toContain('2026.9.30.1');
		expect(behind).toMatch(/\b4 releases?\b/);
		expect(behind).toMatch(/\b26 days?\b/);
		expect(behind).toContain('suede update');

		const [atLatest] = fromRow(
			withProject('2026.10.26', { ok: true, value: measureDrift('2026.10.26', tags) })
		);
		expect(atLatest).toContain('2026.10.26');
		expect(atLatest).toContain('latest');

		let reason = '';
		try {
			measureDrift('0.1.0', tags);
		} catch (error) {
			reason = (error as Error).message;
		}
		expect(reason).not.toBe('');
		const [unavailable] = fromRow(withProject('0.1.0', { ok: false, reason }));
		expect(unavailable).toContain('unavailable');
		expect(unavailable).toContain(reason);
	});
});

describe('upgradeCommand', () => {
	it('matches the package manager that installed the binary', () => {
		expect(
			upgradeCommand('/Users/a/.volta/tools/image/packages/create-suede/lib/dist/suede.mjs')
		).toBe('volta install create-suede@latest');
		expect(
			upgradeCommand('/Users/a/Library/pnpm/global/5/node_modules/create-suede/dist/suede.mjs')
		).toBe('pnpm add -g create-suede@latest');
		expect(upgradeCommand('/usr/local/lib/node_modules/create-suede/dist/suede.mjs')).toBe(
			'npm install -g create-suede@latest'
		);
	});
});

describe('runVersion', () => {
	const startDirectory = process.cwd();
	let scratch = '';
	let printed: string[] = [];

	beforeEach(() => {
		scratch = mkdtempSync(join(tmpdir(), 'suede-version-'));
		printed = [];
		vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
		vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ latest: '0.7.1' })));
	});

	afterEach(() => {
		process.chdir(startDirectory);
		rmSync(scratch, { recursive: true, force: true });
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows the project's suede.from when run inside a suede project", async () => {
		writeFileSync(
			join(scratch, 'package.json'),
			JSON.stringify({ name: 'scratch', suede: { from: '2026.10.21' } })
		);
		process.chdir(scratch);
		await runVersion();
		expect(printed.join('\n')).toMatch(/suede\.from\s+2026\.10\.21/);
	});

	it('leaves out suede.from when run outside a suede project', async () => {
		process.chdir(scratch);
		await runVersion();
		const output = printed.join('\n');
		expect(output).toMatch(/suede latest\s+2026\.10\.26/);
		expect(output).not.toContain('suede.from');
	});
});
