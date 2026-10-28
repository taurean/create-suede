import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as prompts from '@clack/prompts';
import { copyToClipboard } from './clipboard.ts';
import { run } from './exec.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { measureDrift, type Drift } from './status.ts';
import { paint, tildify } from './style.ts';
import { downloadTemplate, fetchTemplateTags, listFiles, templateChangelog } from './template.ts';
import { branchExists, hasOrigin, listWorktrees, siblingPath } from './worktree.ts';

export const UPDATE_USAGE = "Merges the latest suede's skills and agents into a new worktree.";

const execFileAsync = promisify(execFile);

/** The process layer: merged three ways, file by file. */
const MERGE_AREAS = ['.claude/skills/', '.claude/agents/'];

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

function inArea(path: string, areas: string[]): boolean {
	return areas.some((area) => path.startsWith(area));
}

/**
 * Writes suede's changes between `base` and `theirs` into `project`'s process
 * layer, three ways, and reports what it did. Changes nothing outside the areas.
 */
export async function applyUpdate(directories: UpdateDirectories): Promise<UpdateReport> {
	const report: UpdateReport = { merged: [], conflicted: [] };
	const [baseFiles, theirFiles] = await Promise.all([
		listFiles(directories.base),
		listFiles(directories.theirs)
	]);
	const theirSet = new Set(theirFiles);

	for (const path of baseFiles.filter((file) => inArea(file, MERGE_AREAS))) {
		if (!theirSet.has(path)) continue;
		const projectPath = join(directories.project, path);
		const [base, theirs, ours] = await Promise.all([
			readFile(join(directories.base, path)),
			readFile(join(directories.theirs, path)),
			readIfExists(projectPath)
		]);
		if (!ours || base.equals(theirs)) continue;
		const conflicted = await mergeFile(
			projectPath,
			join(directories.base, path),
			join(directories.theirs, path)
		);
		(conflicted ? report.conflicted : report.merged).push(path);
	}
	return report;
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
		spinner.error(`${tildify(worktreePath)} already exists`);
		throw new Error(`${tildify(worktreePath)} already exists. Finish or remove that update first.`);
	}
	if (await branchExists(main.path, branch)) {
		spinner.error(`Branch ${branch} already exists`);
		throw new Error(`Branch ${branch} already exists. Finish or delete that update first.`);
	}

	const downloads = await mkdtemp(join(tmpdir(), 'suede-update-'));
	let report: UpdateReport;
	let changelog: string[];
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
		const manifest = await readFile(manifestPath, 'utf8');
		await writeFile(manifestPath, replaceSuedeFrom(manifest, from, drift.latest));

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
	list('Merged', report.merged);
	prompts.log.message(changelog.join('\n'));

	const cdCommand = `cd ${tildify(worktreePath)}`;
	const copied = await copyToClipboard(cdCommand);
	prompts.log.message(`${paint('cyan', cdCommand)}${copied ? paint('dim', '  ← copied') : ''}`);
}
