import { expect, it } from 'vitest';
import { validateProjectName } from './project-name.ts';

it('accepts kebab-case names and rejects everything else', () => {
	expect(validateProjectName('my-app2')).toBeUndefined();
	expect(validateProjectName('')).toBeDefined();
	expect(validateProjectName('My App')).toBeDefined();
	expect(validateProjectName('../escape')).toBeDefined();
	expect(validateProjectName('-leading')).toBeDefined();
});
