import { constants, existsSync, lstatSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as prompts from '@clack/prompts';
import { copyToClipboard } from './clipboard.ts';
import { linkEnvFiles, listEnvFiles } from './env-files.ts';
import { run } from './exec.ts';
import { addSuedeField } from './manifest.ts';
import { findGitRoot, NOT_A_GIT_REPO } from './project.ts';
import { projectDirFor, validateProjectName } from './project-name.ts';
import { paint, tildify } from './style.ts';
import { downloadTemplate, listFiles, resolveLatestTag } from './template.ts';
import { detectVersioning, type Versioning } from './versioning.ts';
import { branchExists, hasOrigin, isDirty, listWorktrees, siblingPath } from './worktree.ts';

export const INSTALL_USAGE =
	"Clones this repository into ~/Developer/<name>/main and adds suede's process layer.";

export const INSTALL_BRANCH = 'chore/suede-install';

/** suede's process skills. `design` and `writing-css` assume suede-css; kickoff refuses non-bootstrapped repos. */
const PROCESS_SKILLS = ['task', 'review', 'project-plan', 'orient'];
const AGENTS = '.claude/agents/';

/** suede's CLAUDE.md, under a name that can't collide with the project's. Kickoff merges it. */
export const SUEDE_CLAUDE_MD = 'SUEDE_CLAUDE.md';

export interface InstallPlan {
	/** The original repository's main checkout. Read, never written. */
	source: string;
	/** The `origin` URL the new checkout is cloned from. */
	origin: string;
	/** `<container>/<name>/main`. */
	projectDir: string;
	/** suede at `tag`, extracted. */
	template: string;
	tag: string;
	versioning: Versioning;
}

export interface InstallReport {
	/** The `chore/suede-install` worktree holding the uncommitted install. */
	worktree: string;
	/** False when `projectDir` already was the source checkout, so nothing was cloned. */
	cloned: boolean;
	/** suede files written into the worktree, as paths relative to it. */
	written: string[];
	/** Of `written`, the ones the project already had and suede's copy replaced. */
	replaced: string[];
	/** Env files copied into `projectDir` (when cloned) and linked into the worktree. */
	envFiles: string[];
}

function sameDirectory(a: string, b: string): boolean {
	return realpathSync(a) === realpathSync(b);
}

/** An error message when `projectDir` is taken by something other than the source checkout. */
export function destinationError(projectDir: string, source: string): string | undefined {
	if (!existsSync(projectDir) || sameDirectory(projectDir, source)) return undefined;
	return `${tildify(projectDir)} already exists. Pick another name with suede install <name>, or move that directory.`;
}

/** The repository's name from its `origin` URL: `git@github.com:a/b.git` and `https://github.com/a/b` are both `b`. */
export function repoNameFromUrl(url: string): string {
	return url
		.replace(/\/+$/, '')
		.replace(/\.git$/, '')
		.split(/[/:]/)
		.at(-1)!;
}

/**
 * Throws when any existing segment of `path` under `root` is a symlink. origin
 * can track one (say `.claude` linked to a shared directory), and a write through
 * it would land outside the worktree.
 */
function assertNoSymlink(root: string, path: string): void {
	let current = root;
	for (const segment of path.split('/')) {
		current = join(current, segment);
		if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
			throw new Error(
				`${tildify(current)} is a symlink in origin's main; install won't write ${path} through it.`
			);
		}
	}
}

/** Every file suede installs, as paths relative to the template root. */
async function processLayerFiles(template: string, tag: string): Promise<string[]> {
	const files: string[] = [];
	for (const skill of PROCESS_SKILLS) {
		const directory = `.claude/skills/${skill}/`;
		if (!existsSync(join(template, directory))) {
			throw new Error(`suede ${tag} has no ${directory}; install's skill list is out of date.`);
		}
		files.push(...(await listFiles(join(template, directory))).map((file) => directory + file));
	}
	files.push(...(await listFiles(join(template, AGENTS))).map((file) => AGENTS + file));
	return files;
}

/**
 * Clones `origin` into `projectDir` (unless it's already the source checkout),
 * creates the install worktree beside it, and writes suede's process layer and
 * lineage into that worktree, uncommitted.
 */
export async function install(plan: InstallPlan): Promise<InstallReport> {
	const taken = destinationError(plan.projectDir, plan.source);
	if (taken) throw new Error(taken);
	const cloned = !existsSync(plan.projectDir);

	const worktree = siblingPath(plan.projectDir, INSTALL_BRANCH);
	if (existsSync(worktree)) {
		throw new Error(`${tildify(worktree)} already exists. Finish or remove that install first.`);
	}

	if (cloned) {
		await mkdir(dirname(plan.projectDir), { recursive: true });
		await run('git', ['clone', '--quiet', plan.origin, plan.projectDir]);
		for (const name of await listEnvFiles(plan.source)) {
			// Exclusive: origin's main may now track a file the source checkout still ignores.
			await copyFile(
				join(plan.source, name),
				join(plan.projectDir, name),
				constants.COPYFILE_EXCL
			).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== 'EEXIST') throw error;
				throw new Error(
					`origin's main tracks ${name}, which this checkout ignores, so install won't copy yours over it. Untrack it on main first.`,
					{ cause: error }
				);
			});
		}
	} else {
		await run('git', ['fetch', '--quiet', 'origin', 'main'], plan.projectDir);
	}
	if (await branchExists(plan.projectDir, INSTALL_BRANCH)) {
		throw new Error(
			`Branch ${INSTALL_BRANCH} already exists. Finish or delete that install first.`
		);
	}
	await run(
		'git',
		['worktree', 'add', '--quiet', worktree, '-b', INSTALL_BRANCH, 'origin/main'],
		plan.projectDir
	);
	const envFiles = await linkEnvFiles(plan.projectDir, worktree);

	const manifestPath = join(worktree, 'package.json');
	assertNoSymlink(worktree, 'package.json');
	if (!existsSync(manifestPath)) {
		throw new Error(`origin/main has no package.json, so there's nowhere to record suede.from.`);
	}

	const written: string[] = [];
	const replaced: string[] = [];
	const copies: [from: string, to: string][] = [
		...(await processLayerFiles(plan.template, plan.tag)).map(
			(path) => [path, path] as [string, string]
		),
		['CLAUDE.md', SUEDE_CLAUDE_MD]
	];
	for (const [from, to] of copies) {
		assertNoSymlink(worktree, to);
		const destination = join(worktree, to);
		if (existsSync(destination)) replaced.push(to);
		await mkdir(dirname(destination), { recursive: true });
		await copyFile(join(plan.template, from), destination);
		written.push(to);
	}

	const manifest = await readFile(manifestPath, 'utf8');
	await writeFile(manifestPath, addSuedeField(manifest, plan.tag, plan.versioning));
	written.push('package.json');

	return { worktree, cloned, written, replaced, envFiles };
}

function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
	if (prompts.isCancel(value)) {
		prompts.cancel('Cancelled. Nothing was created.');
		process.exit(0);
	}
	return value as Exclude<T, symbol>;
}

/**
 * What a fresh clone of origin won't carry over from the original repository,
 * one line per item: uncommitted changes in any of its worktrees, stashes, and
 * commits on local branches that no `origin/*` ref reaches. Reads origin's refs
 * as last fetched, so it never writes to the original repository.
 */
export async function findUnpushedWork(source: string): Promise<string[]> {
	const lost: string[] = [];
	for (const worktree of await listWorktrees(source)) {
		// A worktree whose directory was deleted is listed until `git worktree prune`.
		if (!existsSync(worktree.path)) continue;
		if (await isDirty(worktree.path)) lost.push(`${tildify(worktree.path)}: uncommitted changes`);
	}
	const stashes = (await run('git', ['stash', 'list'], source)).split('\n').filter(Boolean).length;
	if (stashes > 0) lost.push(`${stashes} stash${stashes === 1 ? '' : 'es'}`);
	const branches = (
		await run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], source)
	)
		.split('\n')
		.filter(Boolean);
	for (const branch of branches) {
		const count = Number(
			(
				await run(
					'git',
					['rev-list', '--count', `refs/heads/${branch}`, '--not', '--remotes=origin'],
					source
				)
			).trim()
		);
		if (count > 0) lost.push(`${branch}: ${count} commit${count === 1 ? '' : 's'} not on origin`);
	}
	return lost;
}

/** Throws unless origin's default branch is `main`, which every suede command assumes. */
async function assertMainIsDefault(source: string): Promise<void> {
	const head = await run('git', ['ls-remote', '--symref', 'origin', 'HEAD'], source);
	const branch = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(head)?.[1];
	if (branch !== 'main') {
		throw new Error(
			branch
				? `origin's default branch is ${branch}, not main. suede's commands assume main.`
				: "origin has no default branch (is it empty?). suede's commands assume main."
		);
	}
}

async function askName(argument: string | undefined, origin: string): Promise<string> {
	const name = argument ?? repoNameFromUrl(origin);
	const error = validateProjectName(name);
	if (!error) return name;
	prompts.log.warn(`"${name}" can't be the project directory. ${error}`);
	return exitIfCancelled(
		await prompts.text({
			message: 'Project name',
			placeholder: 'my-project',
			validate: validateProjectName
		})
	);
}

async function askVersioning(version: unknown): Promise<Versioning> {
	const detected = typeof version === 'string' ? detectVersioning(version) : undefined;
	if (detected) return detected;
	prompts.log.warn(
		`package.json's version ${version === undefined ? 'is missing' : `"${String(version)}" is neither chronver nor semver`}, so suede release can't tell the scheme.`
	);
	return exitIfCancelled(
		await prompts.select<Versioning>({
			message: 'Versioning',
			options: [
				{ value: 'chronver', label: 'Chronver', hint: 'apps and sites' },
				{ value: 'semver', label: 'Semver', hint: 'libraries with dependents' }
			]
		})
	);
}

export async function runInstall(nameArgument: string | undefined): Promise<void> {
	const gitRoot = findGitRoot(process.cwd());
	if (!gitRoot) throw new Error(NOT_A_GIT_REPO);
	const [main] = await listWorktrees(gitRoot);
	if (!main) throw new Error('git worktree list returned nothing.');
	const source = main.path;

	const manifestPath = join(source, 'package.json');
	if (!existsSync(manifestPath)) {
		throw new Error(
			`${tildify(source)} has no package.json, so there's nowhere to record suede.from.`
		);
	}
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		version?: unknown;
		suede?: { from?: unknown };
	};
	if (manifest.suede?.from !== undefined) {
		throw new Error(
			`This is already a suede project (suede.from ${String(manifest.suede.from)}). Use suede update to bring in newer suede.`
		);
	}
	if (!(await hasOrigin(source))) {
		throw new Error('This repository has no origin remote. suede install clones from origin.');
	}
	const origin = (await run('git', ['remote', 'get-url', 'origin'], source)).trim();
	await assertMainIsDefault(source);

	const name = await askName(nameArgument, origin);
	const projectDir = projectDirFor(name);
	const taken = destinationError(projectDir, source);
	if (taken) throw new Error(taken);
	const versioning = await askVersioning(manifest.version);

	// Only a clone loses anything; an existing projectDir is the source checkout itself.
	if (!existsSync(projectDir)) {
		const lost = await findUnpushedWork(source);
		if (lost.length > 0) {
			prompts.log.warn(
				`The clone comes from origin, so it won't have:\n${lost.map((line) => `  ${line}`).join('\n')}`
			);
			const proceed = exitIfCancelled(
				await prompts.confirm({ message: 'Clone anyway?', initialValue: false })
			);
			if (!proceed) {
				prompts.cancel('Cancelled. Nothing was created.');
				return;
			}
		}
	}

	const spinner = prompts.spinner({ indicator: 'timer' });
	spinner.start('Finding the latest suede release');
	const downloads = await mkdtemp(join(tmpdir(), 'suede-install-'));
	let report: InstallReport;
	let tag: string;
	try {
		tag = (await resolveLatestTag()).tag;
		spinner.message(`Downloading suede ${tag}`);
		await downloadTemplate(tag, downloads);
		spinner.message(
			existsSync(projectDir) ? `Creating ${INSTALL_BRANCH}` : `Cloning into ${tildify(projectDir)}`
		);
		report = await install({ source, origin, projectDir, template: downloads, tag, versioning });
	} catch (error) {
		spinner.error(
			existsSync(projectDir) && !sameDirectory(projectDir, source)
				? `Could not finish the install. ${tildify(dirname(projectDir))} is left as it is; remove it before running install again.`
				: 'Could not install suede'
		);
		throw error;
	} finally {
		await rm(downloads, { recursive: true, force: true });
	}

	spinner.stop(
		`Installed suede ${paint('bold', tag)} on ${paint('bold', INSTALL_BRANCH)}, uncommitted`
	);
	prompts.log.message(`Written\n${report.written.map((path) => `  ${path}`).join('\n')}`);
	if (report.replaced.length > 0) {
		prompts.log.message(
			`${paint('yellow', "Replaced the project's own copy")}\n${report.replaced.map((path) => `  ${path}`).join('\n')}`
		);
	}
	if (report.envFiles.length > 0) {
		prompts.log.message(
			report.cloned
				? `${paint('yellow', 'Copied env files')} into ${tildify(projectDir)}; these secrets now live in both checkouts:\n${report.envFiles.map((file) => `  ${file}`).join('\n')}`
				: `Linked env files: ${report.envFiles.join(', ')}`
		);
	}
	prompts.log.message(
		`Merge what applies from ${SUEDE_CLAUDE_MD} into CLAUDE.md, then delete it. suede's skills read their rules from CLAUDE.md.`
	);
	if (report.cloned) {
		prompts.log.message(
			paint('dim', `${tildify(source)} is untouched. Remove it once you've moved over.`)
		);
	}

	const cdCommand = `cd ${tildify(report.worktree)}`;
	const copied = await copyToClipboard(cdCommand);
	prompts.log.message(`${paint('cyan', cdCommand)}${copied ? paint('dim', '  ← copied') : ''}`);
}
