import { describe, expect, it } from 'vitest';
import { bumpSemver, defaultVersion, resolveVersioning } from './versioning.ts';

describe('defaultVersion', () => {
	it('uses the date for chronver and 0.1.0 for semver', () => {
		expect(defaultVersion('chronver', new Date(2026, 8, 30))).toBe('2026.9.30');
		expect(defaultVersion('semver')).toBe('0.1.0');
	});
});

describe('resolveVersioning', () => {
	it('prefers the recorded scheme', () => {
		expect(resolveVersioning('semver', '2026.9.30')).toBe('semver');
	});

	it('infers the scheme from the version when nothing is recorded', () => {
		expect(resolveVersioning(undefined, '2026.9.30.1')).toBe('chronver');
		expect(resolveVersioning(undefined, '0.4.0')).toBe('semver');
		expect(() => resolveVersioning(undefined, 'next')).toThrow();
	});
});

describe('bumpSemver', () => {
	it('bumps each level and resets the lower ones', () => {
		expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4');
		expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0');
		expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0');
	});
});
