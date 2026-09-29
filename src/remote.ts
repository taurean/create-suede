import { run } from './exec.ts';

export type Visibility = 'private' | 'public';

/** Creates the GitHub repository, adds it as `origin`, and pushes `main`. */
export async function createRemote(
	projectDir: string,
	name: string,
	visibility: Visibility
): Promise<string> {
	await run(
		'gh',
		['repo', 'create', name, `--${visibility}`, '--source', projectDir, '--remote', 'origin'],
		projectDir
	);
	await run('git', ['push', '--quiet', '-u', 'origin', 'main'], projectDir);
	return (await run('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], projectDir)).trim();
}
