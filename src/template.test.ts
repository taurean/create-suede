import { describe, expect, it } from 'vitest';
import { chronverTags } from './chronver.ts';
import { measureDrift } from './template.ts';

const tags = chronverTags(
	['2026.9.30.1', '2026.10.17', '2026.10.21', '2026.10.21.1', '2026.10.26']
		.map((tag) => `abc\trefs/tags/${tag}`)
		.join('\n')
);

describe('measureDrift', () => {
	it('counts newer tags, .N cuts included, and the days between tag dates', () => {
		expect(measureDrift('2026.9.30.1', tags)).toEqual({
			latest: '2026.10.26',
			releases: 4,
			days: 26
		});
	});

	it('reports no drift at the latest tag', () => {
		expect(measureDrift('2026.10.26', tags)).toEqual({
			latest: '2026.10.26',
			releases: 0,
			days: 0
		});
	});

	it('rejects a suede.from that is not chronver', () => {
		expect(() => measureDrift('0.1.0', tags)).toThrow('suede.from "0.1.0" isn\'t a chronver tag.');
	});

	it('rejects a suede.from with no matching tag, even one dated after the latest', () => {
		expect(() => measureDrift('2026.10.22', tags)).toThrow(
			"suede.from 2026.10.22 isn't a tag on taurean/suede."
		);
		expect(() => measureDrift('2026.11.1', tags)).toThrow(
			"suede.from 2026.11.1 isn't a tag on taurean/suede."
		);
	});
});
