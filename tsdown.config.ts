import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		'create-suede': 'src/bin/create-suede.ts',
		suede: 'src/bin/suede.ts'
	},
	format: 'esm',
	platform: 'node',
	target: 'node22'
});
