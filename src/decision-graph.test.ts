import { describe, expect, it } from 'vitest';
import { remoteUrl } from './decision-graph.ts';

describe('remoteUrl', () => {
	it('reads the url from the [remote] section', () => {
		const config = [
			'[branch]',
			'main_branches = ["main", "master"]',
			'',
			'[remote]',
			'url = "http://127.0.0.1:24680"',
			'workspace = "main"',
			''
		].join('\n');
		expect(remoteUrl(config)).toBe('http://127.0.0.1:24680');
	});

	it('ignores a url outside [remote]', () => {
		const config = [
			'[mirror]',
			'url = "https://elsewhere.test"',
			'',
			'[remote]',
			'workspace = "x"'
		].join('\n');
		expect(() => remoteUrl(config)).toThrow('[remote] url');
	});

	it('fails loudly when there is no [remote] section', () => {
		expect(() => remoteUrl('[branch]\nauto_detect = true\n')).toThrow('[remote] url');
	});
});
