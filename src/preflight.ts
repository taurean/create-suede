import { isInstalled } from './exec.ts';

export const REQUIRED_TOOLS = {
	git: 'https://git-scm.com/downloads',
	node: 'https://nodejs.org',
	pnpm: 'https://pnpm.io/installation',
	deciduous: 'https://github.com/anomalyco/deciduous (cargo install deciduous)'
} as const;

export async function findMissingTools(): Promise<(keyof typeof REQUIRED_TOOLS)[]> {
	const tools = Object.keys(REQUIRED_TOOLS) as (keyof typeof REQUIRED_TOOLS)[];
	const installed = await Promise.all(tools.map(isInstalled));
	return tools.filter((_, index) => !installed[index]);
}
