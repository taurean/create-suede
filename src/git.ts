import { run } from './exec.ts';

const ADD_BATCH_SIZE = 200;

export async function initRepository(cwd: string): Promise<void> {
	await run('git', ['init', '--initial-branch=main'], cwd);
}

/** Stages an explicit file list. Never `git add .`: the list is the contract. */
export async function stageFiles(cwd: string, files: string[]): Promise<void> {
	for (let start = 0; start < files.length; start += ADD_BATCH_SIZE) {
		await run('git', ['add', '--', ...files.slice(start, start + ADD_BATCH_SIZE)], cwd);
	}
}

export async function untrackedFiles(cwd: string, paths: string[]): Promise<string[]> {
	const output = await run(
		'git',
		['ls-files', '--others', '--exclude-standard', '--', ...paths],
		cwd
	);
	return output.split('\n').filter(Boolean);
}

export async function commit(cwd: string, message: string): Promise<void> {
	await run('git', ['commit', '--quiet', '-m', message], cwd);
}

export async function createBranch(cwd: string, branch: string): Promise<void> {
	await run('git', ['checkout', '--quiet', '-b', branch], cwd);
}
