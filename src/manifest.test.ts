import { describe, expect, it } from 'vitest';
import {
	applyToPackageJson,
	applyToDemoPage,
	applyToPackageLock,
	applyToWranglerConfig,
	replaceVersionText,
	detectIndent
} from './manifest.ts';

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

describe('applyToWranglerConfig', () => {
	it('renames the Worker and keeps comments and other fields', () => {
		const source = [
			'{',
			'\t"$schema": "./node_modules/wrangler/config-schema.json",',
			'\t// the Worker name',
			'\t"name": "suede",',
			'\t"d1_databases": [{ "binding": "DB", "database_name": "suede-db" }]',
			'}'
		].join('\n');
		const result = applyToWranglerConfig(source, 'snark-jar');
		expect(result).toContain('"name": "snark-jar",');
		expect(result).toContain('// the Worker name');
		expect(result).toContain('"database_name": "suede-db"');
	});

	it('leaves a config without a name untouched', () => {
		expect(applyToWranglerConfig('{ "main": "x.js" }', 'demo')).toBe('{ "main": "x.js" }');
	});
});

describe('applyToDemoPage', () => {
	it('replaces the placeholder heading and tagline', () => {
		const page = '<h1>suede</h1>\n<p>a template repo.</p>\n';
		expect(applyToDemoPage(page, 'snark-jar', 'like a swear jar, but for snark')).toBe(
			'<h1>snark-jar</h1>\n<p>like a swear jar, but for snark</p>\n'
		);
	});

	it('escapes characters Svelte would treat as markup or expressions', () => {
		const page = '<h1>suede</h1>\n<p>a template repo.</p>\n';
		expect(applyToDemoPage(page, 'demo', 'uses {braces} & <tags>')).toContain(
			'<p>uses &#123;braces&#125; &amp; &lt;tags&gt;</p>'
		);
	});

	it('leaves a page without the placeholders untouched', () => {
		expect(applyToDemoPage('<h1>Home</h1>', 'demo', 'x')).toBe('<h1>Home</h1>');
	});
});

describe('replaceVersionText', () => {
	it('changes only the version line and keeps formatting', () => {
		const source = '{\n\t"name": "a",\n\t"version": "1.0.0",\n\t"suede": { "from": "x" }\n}\n';
		expect(replaceVersionText(source, '1.0.0', '1.1.0', 1)).toBe(
			'{\n\t"name": "a",\n\t"version": "1.1.0",\n\t"suede": { "from": "x" }\n}\n'
		);
	});

	it('changes the lockfile root entries but not a dependency on the same version', () => {
		const lock = [
			'{',
			'  "version": "1.0.0",',
			'  "packages": {',
			'    "": { "version": "1.0.0" },',
			'    "node_modules/dep": { "version": "1.0.0" }',
			'  }',
			'}'
		].join('\n');
		const result = replaceVersionText(lock, '1.0.0', '2.0.0', 2);
		expect(result.match(/"version": "2.0.0"/g)).toHaveLength(2);
		expect(result).toContain('"node_modules/dep": { "version": "1.0.0" }');
	});

	it('treats dots in the old version literally', () => {
		expect(replaceVersionText('"version": "2026x9x30"', '2026.9.30', 'n', 1)).toBe(
			'"version": "2026x9x30"'
		);
	});
});
