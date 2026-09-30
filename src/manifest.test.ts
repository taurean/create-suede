import { describe, expect, it } from 'vitest';
import { applyToPackageJson, applyToPackageLock, detectIndent } from './manifest.ts';

const fields = {
	name: 'example',
	version: '2026.9.29',
	versioning: 'chronver' as const,
	description: 'An example',
	suedeTag: '2026.9.29'
};

describe('applyToPackageJson', () => {
	it('sets identity and lineage, keeping other fields', () => {
		const result = applyToPackageJson(
			{ name: 'suede', private: true, version: '1', scripts: {} },
			fields
		);
		expect(result).toEqual({
			private: true,
			scripts: {},
			name: 'example',
			version: '2026.9.29',
			description: 'An example',
			suede: { from: '2026.9.29', versioning: 'chronver' }
		});
	});
});

describe('applyToPackageLock', () => {
	it('updates the root and the root package entry', () => {
		const lock = {
			name: 'suede',
			version: '1',
			packages: { '': { name: 'suede', version: '1' }, 'node_modules/x': {} }
		};
		expect(applyToPackageLock(lock, fields)).toEqual({
			name: 'example',
			version: '2026.9.29',
			packages: { '': { name: 'example', version: '2026.9.29' }, 'node_modules/x': {} }
		});
	});
});

describe('detectIndent', () => {
	it('reads tabs or spaces from the first indented key', () => {
		expect(detectIndent('{\n\t"a": 1\n}')).toBe('\t');
		expect(detectIndent('{\n  "a": 1\n}')).toBe('  ');
	});
});
