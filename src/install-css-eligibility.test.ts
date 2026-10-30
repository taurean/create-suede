import { expect, it } from 'vitest';
import { suedeCssSkipReason } from './install.ts';

it('skips suede-css with one line naming what the project lacks, and offers it when the project has both', () => {
	expect(suedeCssSkipReason({ dependencies: { '@sveltejs/kit': '^2.0.0' } }, true)).toBeUndefined();
	expect(
		suedeCssSkipReason({ devDependencies: { '@sveltejs/kit': '^2.0.0' } }, true)
	).toBeUndefined();

	const noKit = suedeCssSkipReason({ dependencies: { svelte: '^5.0.0' } }, true);
	expect(noKit).toContain('@sveltejs/kit');
	expect(noKit).not.toContain('pnpm-lock.yaml');
	expect(noKit).not.toContain('\n');

	const noLockfile = suedeCssSkipReason({ devDependencies: { '@sveltejs/kit': '^2.0.0' } }, false);
	expect(noLockfile).toContain('pnpm-lock.yaml');
	expect(noLockfile).not.toContain('@sveltejs/kit');
	expect(noLockfile).not.toContain('\n');

	const noManifestDeps = suedeCssSkipReason({}, true);
	expect(noManifestDeps).toContain('@sveltejs/kit');
	expect(noManifestDeps).not.toContain('\n');

	const lacksBoth = suedeCssSkipReason({}, false);
	expect(lacksBoth).toContain('@sveltejs/kit');
	expect(lacksBoth).toContain('pnpm-lock.yaml');
	expect(lacksBoth).not.toContain('\n');
});
