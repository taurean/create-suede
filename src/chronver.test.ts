import { describe, expect, it } from 'vitest';
import { latestChronverTag, parseChronver, todayChronver } from './chronver.ts';

describe('parseChronver', () => {
	it('accepts day, changeset, and label forms', () => {
		expect(parseChronver('2026.9.29')).toMatchObject({
			year: 2026,
			month: 9,
			day: 29,
			changeset: 0
		});
		expect(parseChronver('2026.7.3.3')).toMatchObject({ changeset: 3 });
		expect(parseChronver('2026.7.3-break')).toMatchObject({ label: 'break' });
	});

	it('rejects leading zeros and impossible dates', () => {
		expect(parseChronver('2026.06.04')).toBeUndefined();
		expect(parseChronver('2026.13.1')).toBeUndefined();
		expect(parseChronver('v1.2.3')).toBeUndefined();
	});
});

describe('todayChronver', () => {
	it('formats without leading zeros', () => {
		expect(todayChronver(new Date(2026, 5, 4))).toBe('2026.6.4');
	});
});

describe('latestChronverTag', () => {
	it('picks the newest tag by date and changeset, using the peeled commit', () => {
		const output = [
			'aaa\trefs/tags/2026.7.3.2',
			'bbb\trefs/tags/2026.7.3.2^{}',
			'ccc\trefs/tags/2026.7.3.10',
			'ddd\trefs/tags/2026.7.3.10^{}',
			'eee\trefs/tags/2026.6.30',
			'fff\trefs/tags/not-a-version'
		].join('\n');
		expect(latestChronverTag(output)).toEqual({ tag: '2026.7.3.10', commit: 'ddd' });
	});

	it('returns undefined when no tag is chronver', () => {
		expect(latestChronverTag('aaa\trefs/tags/v1.0.0\n')).toBeUndefined();
	});
});
