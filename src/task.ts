import { existsSync } from 'node:fs';
import * as prompts from '@clack/prompts';
import { copyToClipboard } from './clipboard.ts';
import { linkEnvFiles } from './env-files.ts';
import { run } from './exec.ts';
import { findGitRoot, NOT_A_GIT_REPO, NOT_PNPM, usesPnpm } from './project.ts';
import { paint, tildify } from './style.ts';
import {
	branchExists,
	hasOrigin,
	listWorktrees,
	siblingPath,
	validateTaskBranch
} from './worktree.ts';

export const TASK_USAGE = 'Starts <type>/<slug> in a sibling worktree off the latest main.';

export async function runTask(branch: string | undefined): Promise<void> {
	const branchError = validateTaskBranch(branch);
	if (branchError || !branch) throw new Error(branchError);

	const gitRoot = findGitRoot(process.cwd());
	if (!gitRoot) throw new Error(NOT_A_GIT_REPO);

	// Lists the main checkout first, whichever worktree gitRoot is.
	const [main] = await listWorktrees(gitRoot);
	if (!main) throw new Error('git worktree list returned nothing.');
	if (!usesPnpm(main.path)) throw new Error(NOT_PNPM);
	const worktreePath = siblingPath(main.path, branch);

	if (existsSync(worktreePath)) throw new Error(`${tildify(worktreePath)} already exists.`);
	if (await branchExists(main.path, branch)) {
		throw new Error(
			`Branch ${branch} already exists. Pick another slug, or delete the branch first.`
		);
	}

	const spinner = prompts.spinner({ indicator: 'timer' });
	let base = 'main';
	let linked: string[];
	try {
		if (await hasOrigin(main.path)) {
			spinner.start('Fetching origin');
			await run('git', ['fetch', '--quiet', 'origin', 'main'], main.path);
			base = 'origin/main';
		} else {
			spinner.start('No origin remote; branching from local main');
		}
		spinner.message(`Creating ${branch}`);
		await run('git', ['worktree', 'add', '--quiet', worktreePath, '-b', branch, base], main.path);
		// Before install, so an install script that reads env sees it.
		spinner.message('Linking env files');
		linked = await linkEnvFiles(main.path, worktreePath);
		spinner.message('Installing dependencies');
		await run('pnpm', ['install'], worktreePath);
	} catch (error) {
		spinner.error(`Could not create ${branch}`);
		throw error;
	}
	spinner.stop(`Created ${paint('bold', branch)} from ${paint('cyan', base)}`);
	if (linked.length > 0) {
		prompts.log.info(`Linked ${linked.join(', ')} from ${tildify(main.path)}`);
	}

	const cdCommand = `cd ${tildify(worktreePath)}`;
	const copied = await copyToClipboard(cdCommand);
	prompts.log.message(`${paint('cyan', cdCommand)}${copied ? paint('dim', '  ← copied') : ''}`);
}
