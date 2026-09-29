import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { downloadTemplate as gigetDownload } from 'giget';
import { latestChronverTag } from './chronver.ts';
import { run } from './exec.ts';

export const TEMPLATE_REPO = 'taurean/suede';

export async function resolveLatestTag(): Promise<{ tag: string; commit: string }> {
	const output = await run('git', [
		'ls-remote',
		'--tags',
		`https://github.com/${TEMPLATE_REPO}.git`
	]);
	const latest = latestChronverTag(output);
	if (!latest) throw new Error(`No chronver tag found on ${TEMPLATE_REPO}.`);
	return latest;
}

/** Extracts the tag's tarball: tracked files only, no .git history. */
export async function downloadTemplate(tag: string, destination: string): Promise<void> {
	await gigetDownload(`gh:${TEMPLATE_REPO}#${tag}`, { dir: destination });
}

/** Every file under `root`, as sorted POSIX paths relative to it. */
export async function listFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() || entry.isSymbolicLink())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'))
		.sort();
}
