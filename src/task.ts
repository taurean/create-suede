import { existsSync } from 'node:fs';
import * as prompts from '@clack/prompts';
import { copyToClipboard } from './clipboard.ts';
import { run } from './exec.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { paint, tildify } from './style.ts';
import { hasOrigin, listWorktrees, siblingPath, validateTaskBranch } from './worktree.ts';

export const TASK_USAGE = 'Starts <type>/<slug> in a sibling worktree off the latest main.';

async function branchExists(cwd: string, branch: string): Promise<boolean> {
	const output = await run('git', ['branch', '--list', branch], cwd);
	return output.trim() !== '';
}

export async function runTask(branch: string | undefined): Promise<void> {
	const branchError = validateTaskBranch(branch);
	if (branchError || !branch) throw new Error(branchError);

	const projectRoot = findProjectRoot(process.cwd());
	if (!projectRoot) throw new Error(NOT_A_PROJECT);

	const [main] = await listWorktrees(projectRoot);
	if (!main) throw new Error('git worktree list returned nothing.');
	const worktreePath = siblingPath(main.path, branch);

	if (existsSync(worktreePath)) throw new Error(`${tildify(worktreePath)} already exists.`);
	if (await branchExists(main.path, branch)) {
		throw new Error(
			`Branch ${branch} already exists. Pick another slug, or delete the branch first.`
		);
	}

	const spinner = prompts.spinner({ indicator: 'timer' });
	let base = 'main';
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
		spinner.message('Installing dependencies');
		await run('pnpm', ['install'], worktreePath);
	} catch (error) {
		spinner.error(`Could not create ${branch}`);
		throw error;
	}
	spinner.stop(`Created ${paint('bold', branch)} from ${paint('cyan', base)}`);

	const cdCommand = `cd ${tildify(worktreePath)}`;
	const copied = await copyToClipboard(cdCommand);
	prompts.log.message(`${paint('cyan', cdCommand)}${copied ? paint('dim', '  ← copied') : ''}`);
}
