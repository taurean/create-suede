import { describe, expect, it } from 'vitest';
import { defaultVersion, validateVersion } from './versioning.ts';

describe('defaultVersion', () => {
	it('uses the date for chronver and 0.1.0 for semver', () => {
		expect(defaultVersion('chronver', new Date(2026, 8, 30))).toBe('2026.9.30');
		expect(defaultVersion('semver')).toBe('0.1.0');
	});
});

describe('validateVersion', () => {
	it('checks the version against the chosen scheme', () => {
		expect(validateVersion('chronver', '2026.9.30')).toBeUndefined();
		expect(validateVersion('chronver', '0.1.0')).toBeDefined();
		expect(validateVersion('semver', '0.1.0')).toBeUndefined();
		expect(validateVersion('semver', '1.02.0')).toBeDefined();
		expect(validateVersion('semver', '2026.9.30.1')).toBeDefined();
	});
});
