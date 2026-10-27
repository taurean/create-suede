import { describe, expect, it } from 'vitest';
import { formatVersionReport, upgradeCommand, type VersionReport } from './version.ts';

const current: VersionReport = {
	installed: '0.7.1',
	npmLatest: { ok: true, value: '0.7.1' },
	suedeLatest: { ok: true, value: '2026.10.26' },
	projectFrom: undefined,
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

	it('adds suede.from and points to suede status inside a project', () => {
		expect(formatVersionReport(current)).not.toContain('suede.from');
		expect(formatVersionReport({ ...current, projectFrom: '2026.10.21.3' })).toMatch(
			/suede\.from\s+2026\.10\.21\.3\s+suede status shows drift/
		);
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
