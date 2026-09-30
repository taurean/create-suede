import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as prompts from '@clack/prompts';
import { nextChronver, todayChronver } from './chronver.ts';
import { run } from './exec.ts';
import { replaceVersionText } from './manifest.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { paint } from './style.ts';
import {
	bumpSemver,
	resolveVersioning,
	SEMVER_LEVELS,
	type SemverLevel,
	type Versioning
} from './versioning.ts';
import { hasOrigin, isDirty } from './worktree.ts';

export const RELEASE_USAGE = 'Commits the version bump on this branch. --tag tags merged main.';

const RELEASE_SUBJECT_PREFIX = 'chore(release):';

interface PackageManifest {
	version: string;
	suede?: { versioning?: unknown };
}

async function readManifest(path: string): Promise<PackageManifest> {
	return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
}

/** Occurrences of the project's own version field in each manifest. */
const VERSION_FIELDS: Record<string, number> = { 'package.json': 1, 'package-lock.json': 2 };

async function writeVersion(path: string, file: string, from: string, to: string): Promise<void> {
	const source = await readFile(path, 'utf8');
	const updated = replaceVersionText(source, from, to, VERSION_FIELDS[file] ?? 1);
	if (file === 'package.json' && updated === source) {
		throw new Error(`Couldn't find "version": "${from}" in package.json.`);
	}
	await writeFile(path, updated);
}

/** Fetches origin (with tags) when there is one; returns the ref that stands for main. */
async function syncMain(cwd: string): Promise<string> {
	if (!(await hasOrigin(cwd))) return 'main';
	await run('git', ['fetch', '--quiet', '--tags', 'origin', 'main'], cwd);
	return 'origin/main';
}

async function versionAt(cwd: string, ref: string): Promise<string> {
	const source = await run('git', ['show', `${ref}:package.json`], cwd);
	return (JSON.parse(source) as PackageManifest).version;
}

async function askSemverLevel(version: string): Promise<SemverLevel> {
	const level = await prompts.select<SemverLevel>({
		message: `Bump ${version}`,
		options: SEMVER_LEVELS.map((value) => ({
			value,
			label: value,
			hint: bumpSemver(version, value)
		}))
	});
	if (prompts.isCancel(level)) {
		prompts.cancel('Cancelled. Nothing was changed.');
		process.exit(0);
	}
	return level;
}

async function chooseVersion(
	versioning: Versioning,
	current: string,
	levelArgument: string | undefined,
	taken: string[]
): Promise<string> {
	if (versioning === 'chronver') {
		if (levelArgument) {
			throw new Error(`This project uses chronver; "${levelArgument}" only applies to semver.`);
		}
		return nextChronver(todayChronver(), taken);
	}
	if (levelArgument !== undefined && !SEMVER_LEVELS.includes(levelArgument as SemverLevel)) {
		throw new Error(`Use one of ${SEMVER_LEVELS.join(', ')}, not "${levelArgument}".`);
	}
	const level = (levelArgument as SemverLevel | undefined) ?? (await askSemverLevel(current));
	return bumpSemver(current, level);
}

export async function runRelease(levelArgument: string | undefined): Promise<void> {
	const root = findProjectRoot(process.cwd());
	if (!root) throw new Error(NOT_A_PROJECT);

	const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root)).trim();
	if (branch === 'main' || branch === 'HEAD') {
		throw new Error('Run suede release on the branch you are about to merge, not on main.');
	}
	if (await isDirty(root)) throw new Error('Commit or stash your changes first.');
	const lastSubject = (await run('git', ['log', '-1', '--format=%s'], root)).trim();
	if (lastSubject.startsWith(RELEASE_SUBJECT_PREFIX)) {
		throw new Error(`This branch is already cut: "${lastSubject}".`);
	}

	const manifest = await readManifest(join(root, 'package.json'));
	const versioning = resolveVersioning(manifest.suede?.versioning, manifest.version);

	const base = await syncMain(root);
	const tags = (await run('git', ['tag', '--list'], root)).split('\n').filter(Boolean);
	const taken = [...tags, await versionAt(root, base)];
	const version = await chooseVersion(versioning, manifest.version, levelArgument, taken);
	if (tags.includes(version)) throw new Error(`Tag ${version} already exists.`);

	const files = Object.keys(VERSION_FIELDS).filter((file) => existsSync(join(root, file)));
	for (const file of files) {
		await writeVersion(join(root, file), file, manifest.version, version);
	}
	await run('git', ['add', '--', ...files], root);
	await run('git', ['commit', '--quiet', '-m', `${RELEASE_SUBJECT_PREFIX} cut ${version}`], root);

	prompts.log.success(`Cut ${paint('bold', version)} on ${paint('cyan', branch)}`);
	prompts.log.message(
		paint('dim', `Push the branch and merge the PR, then run suede release --tag.`)
	);
}

export async function runReleaseTag(): Promise<void> {
	const root = findProjectRoot(process.cwd());
	if (!root) throw new Error(NOT_A_PROJECT);

	const remote = await hasOrigin(root);
	const base = await syncMain(root);
	const version = await versionAt(root, base);
	const tags = (await run('git', ['tag', '--list', version], root)).trim();
	if (tags) throw new Error(`${version} is already tagged. Has main been released since?`);

	const commit = (await run('git', ['rev-parse', base], root)).trim();
	const subject = (await run('git', ['log', '-1', '--format=%s', commit], root)).trim();
	await run('git', ['tag', '-a', version, '-m', version, commit], root);
	if (remote) await run('git', ['push', '--quiet', 'origin', `refs/tags/${version}`], root);

	prompts.log.success(
		`Tagged ${paint('bold', version)} on ${paint('cyan', commit.slice(0, 7))} ${paint('dim', subject)}`
	);
	if (!remote) prompts.log.message(paint('dim', 'No origin remote, so the tag stays local.'));
}
