import { describe, expect, it } from 'vitest';
import { defaultVersion } from './versioning.ts';

describe('defaultVersion', () => {
	it('uses the date for chronver and 0.1.0 for semver', () => {
		expect(defaultVersion('chronver', new Date(2026, 8, 30))).toBe('2026.9.30');
		expect(defaultVersion('semver')).toBe('0.1.0');
	});
});
