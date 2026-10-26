import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { downloadTemplate as gigetDownload } from 'giget';
import { chronverTags, type ChronverTag } from './chronver.ts';
import { run } from './exec.ts';

export const TEMPLATE_REPO = 'taurean/suede';

/** Every chronver tag on suede, oldest first, read with `git ls-remote` (no clone). */
export async function fetchTemplateTags(): Promise<ChronverTag[]> {
	const output = await run('git', [
		'ls-remote',
		'--tags',
		`https://github.com/${TEMPLATE_REPO}.git`
	]);
	return chronverTags(output);
}

export function latestTemplateTag(tags: ChronverTag[]): ChronverTag {
	const latest = tags.at(-1);
	if (!latest) throw new Error(`No chronver tag found on ${TEMPLATE_REPO}.`);
	return latest;
}

export async function resolveLatestTag(): Promise<{ tag: string; commit: string }> {
	return latestTemplateTag(await fetchTemplateTags());
}

/**
 * `git log <from>..<to>` on suede, suede's changelog format. Reads a treeless bare
 * clone (commits only, no file contents) in a temporary directory, removed after.
 */
export async function templateChangelog(from: string, to: string): Promise<string[]> {
	const directory = await mkdtemp(join(tmpdir(), 'suede-changelog-'));
	try {
		await run('git', [
			'clone',
			'--quiet',
			'--bare',
			'--filter=tree:0',
			`https://github.com/${TEMPLATE_REPO}.git`,
			directory
		]);
		const log = await run('git', ['log', '--format=%h %s', `${from}..${to}`], directory);
		return log.split('\n').filter(Boolean);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
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
