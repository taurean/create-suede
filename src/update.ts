import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import * as prompts from '@clack/prompts';
import { copyToClipboard } from './clipboard.ts';
import { run } from './exec.ts';
import { bumpSuedeCss, type SuedeCssBump } from './manifest.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { measureDrift, type Drift } from './status.ts';
import { paint, tildify } from './style.ts';
import {
	downloadTemplate,
	fetchTemplateTags,
	listFiles,
	TEMPLATE_REPO,
	templateChangelog
} from './template.ts';
import { branchExists, hasOrigin, listWorktrees, siblingPath } from './worktree.ts';

export const UPDATE_USAGE = "Merges the latest suede's skills and agents into a new worktree.";

const execFileAsync = promisify(execFile);

/** The process layer: merged three ways, file by file. */
const MERGE_AREAS = ['.claude/skills/', '.claude/agents/'];

/** Suede's components: new files are added, the project's own are never touched. */
const ADD_ONLY_AREAS = ['src/lib/components/'];

export interface UpdateDirectories {
	/** suede at the project's `suede.from`. */
	base: string;
	/** suede at the latest tag. */
	theirs: string;
	/** The project checkout the update is written into. */
	project: string;
}

export interface UpdateReport {
	/** Files that took suede's changes without a conflict. */
	merged: string[];
	/** Files left holding conflict markers. */
	conflicted: string[];
	/** Files suede added, copied in: skills, agents, and components. */
	added: string[];
	/** Files suede removed that the project hadn't edited, deleted. */
	removed: string[];
	/** Files suede removed that the project edited, kept for a person to decide. */
	keptOverRemoval: string[];
	/** Skill directories, agents, or components the project deleted and suede changed since, left out. */
	leftOut: string[];
	/** suede's CLAUDE.md changed. The project's is never touched; it's ported by hand. */
	claudeMdChanged: boolean;
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
	return existsSync(path) ? readFile(path) : undefined;
}

/**
 * `git merge-file` on `current` in place. Exits with the number of conflicts, so
 * a positive exit code is a result, not a failure; a negative one is an error.
 */
async function mergeFile(current: string, base: string, other: string): Promise<boolean> {
	const labels = ['-L', 'project', '-L', 'suede.from', '-L', 'latest suede'];
	try {
		await execFileAsync('git', ['merge-file', ...labels, current, base, other]);
		return false;
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code === 'number' && code > 0) return true;
		const stderr = (error as { stderr?: string }).stderr?.trim();
		throw new Error(`git merge-file failed on ${current}${stderr ? `:\n${stderr}` : '.'}`, {
			cause: error
		});
	}
}

/** Every file under `areas` in `directory`, as paths relative to `directory`. */
async function listAreas(directory: string, areas: string[]): Promise<string[]> {
	const perArea = await Promise.all(
		areas.map(async (area) =>
			existsSync(join(directory, area))
				? (await listFiles(join(directory, area))).map((file) => `${area}${file}`)
				: []
		)
	);
	return perArea.flat();
}

const SKILLS = '.claude/skills/';

/**
 * What a project removes as a whole: a skill is its directory, anything else is
 * its file. A skill the project deleted stays deleted, every file in it.
 */
export function deletionUnit(path: string): string {
	if (!path.startsWith(SKILLS)) return path;
	const [name] = path.slice(SKILLS.length).split('/');
	return `${SKILLS}${name}/`;
}

function inUnit(path: string, unit: string): boolean {
	return unit.endsWith('/') ? path.startsWith(unit) : path === unit;
}

async function claudeMdChanged(directories: UpdateDirectories): Promise<boolean> {
	const [base, theirs] = await Promise.all([
		readIfExists(join(directories.base, 'CLAUDE.md')),
		readIfExists(join(directories.theirs, 'CLAUDE.md'))
	]);
	return !base || !theirs ? base !== theirs : !base.equals(theirs);
}

/**
 * Writes suede's changes between `base` and `theirs` into `project`'s process
 * layer, three ways, adds suede's new components, and reports what it did.
 * Changes nothing outside those areas.
 */
export async function applyUpdate(directories: UpdateDirectories): Promise<UpdateReport> {
	const report: UpdateReport = {
		merged: [],
		conflicted: [],
		added: [],
		removed: [],
		keptOverRemoval: [],
		leftOut: [],
		claudeMdChanged: await claudeMdChanged(directories)
	};
	const [baseFiles, theirFiles, projectFiles] = await Promise.all([
		listAreas(directories.base, MERGE_AREAS),
		listAreas(directories.theirs, MERGE_AREAS),
		listAreas(directories.project, MERGE_AREAS)
	]);
	const [baseSet, theirSet] = [new Set(baseFiles), new Set(theirFiles)];
	const removedUnits = new Set(
		baseFiles.map(deletionUnit).filter((unit) => !projectFiles.some((file) => inUnit(file, unit)))
	);

	// Both sides added a file suede.from didn't have: merged against an empty base.
	const scratch = await mkdtemp(join(tmpdir(), 'suede-merge-'));
	const emptyBase = join(scratch, 'empty');
	await writeFile(emptyBase, '');
	try {
		for (const path of [...new Set([...baseFiles, ...theirFiles])].sort()) {
			const basePath = join(directories.base, path);
			const theirPath = join(directories.theirs, path);
			const projectPath = join(directories.project, path);
			const [base, theirs, ours] = await Promise.all([
				baseSet.has(path) ? readFile(basePath) : undefined,
				theirSet.has(path) ? readFile(theirPath) : undefined,
				readIfExists(projectPath)
			]);
			const changedUpstream = !base || !theirs || !base.equals(theirs);

			const unit = deletionUnit(path);
			if (removedUnits.has(unit)) {
				if (changedUpstream && !report.leftOut.includes(unit)) report.leftOut.push(unit);
				continue;
			}
			if (!changedUpstream) continue;

			if (!theirs) {
				if (!ours || !base) continue;
				if (ours.equals(base)) {
					await rm(projectPath);
					report.removed.push(path);
				} else {
					report.keptOverRemoval.push(path);
				}
			} else if (!ours) {
				if (base) {
					// The project deleted this one file from a skill it kept.
					report.leftOut.push(path);
				} else {
					await mkdir(dirname(projectPath), { recursive: true });
					await copyFile(theirPath, projectPath);
					report.added.push(path);
				}
			} else if (!ours.equals(theirs)) {
				const conflicted = await mergeFile(projectPath, base ? basePath : emptyBase, theirPath);
				(conflicted ? report.conflicted : report.merged).push(path);
			}
		}
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}

	await addNewFiles(directories, report);
	return report;
}

/**
 * Copies in files suede added under the add-only areas since `suede.from`. A file
 * suede already had is the project's: kept as is when present, and left out when
 * the project deleted it.
 */
async function addNewFiles(directories: UpdateDirectories, report: UpdateReport): Promise<void> {
	const [baseFiles, theirFiles, projectFiles] = await Promise.all([
		listAreas(directories.base, ADD_ONLY_AREAS),
		listAreas(directories.theirs, ADD_ONLY_AREAS),
		listAreas(directories.project, ADD_ONLY_AREAS)
	]);
	const [baseSet, projectSet] = [new Set(baseFiles), new Set(projectFiles)];

	for (const path of theirFiles) {
		const projectPath = join(directories.project, path);
		if (baseSet.has(path)) {
			if (projectSet.has(path)) continue;
			const [base, theirs] = await Promise.all([
				readFile(join(directories.base, path)),
				readFile(join(directories.theirs, path))
			]);
			if (!base.equals(theirs)) report.leftOut.push(path);
		} else if (!projectSet.has(path)) {
			await mkdir(dirname(projectPath), { recursive: true });
			await copyFile(join(directories.theirs, path), projectPath);
			report.added.push(path);
		}
	}
}

/**
 * Sets `suede.from` in package.json's source as text, so the diff is that one
 * line. Throws unless `"from": "<from>"` appears exactly once.
 */
export function replaceSuedeFrom(source: string, from: string, to: string): string {
	const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const field = new RegExp(`("from"\\s*:\\s*)"${escaped}"`, 'g');
	const matches = source.match(field)?.length ?? 0;
	if (matches !== 1) {
		throw new Error(
			`Expected one "from": "${from}" in package.json to bump suede.from, found ${matches}.`
		);
	}
	return source.replace(field, `$1${JSON.stringify(to)}`);
}

function list(title: string, paths: string[]): void {
	if (paths.length === 0) return;
	prompts.log.message(`${title}\n${paths.map((path) => `  ${path}`).join('\n')}`);
}

export async function runUpdate(): Promise<void> {
	const root = findProjectRoot(process.cwd());
	if (!root) throw new Error(NOT_A_PROJECT);
	const manifestSource = await readFile(join(root, 'package.json'), 'utf8');
	const from = (JSON.parse(manifestSource) as { suede: { from: string } }).suede.from;

	// Lists the main checkout first, whichever worktree root is.
	const [main] = await listWorktrees(root);
	if (!main) throw new Error('git worktree list returned nothing.');

	const spinner = prompts.spinner({ indicator: 'timer' });
	spinner.start('Resolving suede tags');
	let drift: Drift;
	try {
		drift = measureDrift(from, await fetchTemplateTags());
	} catch (error) {
		spinner.error('Could not resolve suede tags');
		throw error;
	}
	if (drift.releases === 0) {
		spinner.stop(`suede.from ${paint('bold', from)} is the latest suede; nothing to update`);
		return;
	}

	const branch = `chore/suede-update-${drift.latest}`;
	const worktreePath = siblingPath(main.path, branch);
	if (existsSync(worktreePath)) {
		spinner.error('Could not start the update');
		throw new Error(`${tildify(worktreePath)} already exists. Finish or remove that update first.`);
	}
	if (await branchExists(main.path, branch)) {
		spinner.error('Could not start the update');
		throw new Error(`Branch ${branch} already exists. Finish or delete that update first.`);
	}

	const downloads = await mkdtemp(join(tmpdir(), 'suede-update-'));
	let report: UpdateReport;
	let changelog: string[];
	let suedeCss: SuedeCssBump | undefined;
	try {
		const base = join(downloads, 'base');
		const theirs = join(downloads, 'theirs');
		spinner.message(`Downloading suede ${from} and ${drift.latest}`);
		await Promise.all([downloadTemplate(from, base), downloadTemplate(drift.latest, theirs)]);

		let start = 'main';
		if (await hasOrigin(main.path)) {
			spinner.message('Fetching origin');
			await run('git', ['fetch', '--quiet', 'origin', 'main'], main.path);
			start = 'origin/main';
		}
		spinner.message(`Creating ${branch}`);
		await run('git', ['worktree', 'add', '--quiet', worktreePath, '-b', branch, start], main.path);

		spinner.message('Merging');
		report = await applyUpdate({ base, theirs, project: worktreePath });
		const manifestPath = join(worktreePath, 'package.json');
		const manifest = replaceSuedeFrom(await readFile(manifestPath, 'utf8'), from, drift.latest);
		suedeCss = bumpSuedeCss(manifest, await readFile(join(theirs, 'package.json'), 'utf8'));
		await writeFile(manifestPath, suedeCss?.source ?? manifest);
		if (suedeCss) {
			spinner.message(`Installing @taurean/suede-css ${suedeCss.to}`);
			await run('pnpm', ['install'], worktreePath);
		}

		spinner.message('Reading the changelog');
		changelog = await templateChangelog(from, drift.latest);
	} catch (error) {
		spinner.error('Could not update from suede');
		throw error;
	} finally {
		await rm(downloads, { recursive: true, force: true });
	}

	spinner.stop(
		`Merged suede ${paint('bold', drift.latest)} into ${paint('bold', branch)}, uncommitted`
	);
	list(paint('yellow', 'Conflicts to resolve'), report.conflicted);
	list(
		paint('yellow', 'Removed in suede, edited here: kept, decide whether to delete'),
		report.keptOverRemoval
	);
	list('Merged', report.merged);
	list('Added', report.added);
	list('Removed', report.removed);
	list('Removed here, changed in suede: left out', report.leftOut);
	if (report.claudeMdChanged) {
		prompts.log.message(
			`${paint('yellow', "suede's CLAUDE.md changed")}; port what applies by hand:\n  https://github.com/${TEMPLATE_REPO}/compare/${from}...${drift.latest}`
		);
	}
	if (suedeCss) {
		prompts.log.message(
			`${paint('yellow', '@taurean/suede-css')} ${suedeCss.from} → ${suedeCss.to}: check the project's CSS`
		);
	}
	prompts.log.message(changelog.join('\n'));

	const cdCommand = `cd ${tildify(worktreePath)}`;
	const copied = await copyToClipboard(cdCommand);
	prompts.log.message(`${paint('cyan', cdCommand)}${copied ? paint('dim', '  ← copied') : ''}`);
}
