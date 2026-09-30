import { realpathSync } from 'node:fs';
import * as prompts from '@clack/prompts';
import { run } from './exec.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { paint, tildify } from './style.ts';
import {
	hasOrigin,
	hasOwnCommits,
	isDirty,
	listWorktrees,
	mergedBranches,
	planRemovals
} from './worktree.ts';

export const DONE_USAGE = 'Removes worktrees whose branches are merged, then pulls main.';

export async function runDone(): Promise<void> {
	const projectRoot = findProjectRoot(process.cwd());
	if (!projectRoot) throw new Error(NOT_A_PROJECT);

	const worktrees = await listWorktrees(projectRoot);
	const [main] = worktrees;
	if (!main) throw new Error('git worktree list returned nothing.');

	const spinner = prompts.spinner();
	const remote = await hasOrigin(main.path);
	spinner.start(remote ? 'Fetching origin' : 'Checking merged branches');
	if (remote) await run('git', ['fetch', '--quiet', '--prune', 'origin'], main.path);
	const base = remote ? 'origin/main' : 'main';

	const merged = new Set<string>();
	for (const branch of await mergedBranches(main.path, base)) {
		if (await hasOwnCommits(main.path, branch)) merged.add(branch);
	}
	const dirty = new Set<string>();
	for (const worktree of worktrees.slice(1)) {
		if (worktree.branch && merged.has(worktree.branch) && (await isDirty(worktree.path))) {
			dirty.add(worktree.path);
		}
	}
	const plan = planRemovals(worktrees, merged, dirty, realpathSync(process.cwd()));

	for (const worktree of plan.remove) {
		spinner.message(`Removing ${worktree.branch}`);
		await run('git', ['worktree', 'remove', worktree.path], main.path);
		await run('git', ['branch', '-d', worktree.branch ?? ''], main.path);
	}

	let pullNote = '';
	if (remote) {
		const mainBranch = main.branch;
		if (mainBranch !== 'main') {
			pullNote = `Skipped pulling: ${tildify(main.path)} is on ${mainBranch ?? 'a detached HEAD'}, not main.`;
		} else if (await isDirty(main.path)) {
			pullNote = `Skipped pulling: ${tildify(main.path)} has uncommitted changes.`;
		} else {
			spinner.message('Pulling main');
			await run('git', ['merge', '--quiet', '--ff-only', 'origin/main'], main.path);
		}
	}

	const count = plan.remove.length;
	spinner.stop(
		count === 0
			? 'No merged worktrees to remove'
			: `Removed ${count} merged worktree${count === 1 ? '' : 's'}`
	);
	for (const worktree of plan.remove) {
		prompts.log.message(
			`${paint('dim', '−')} ${worktree.branch} ${paint('dim', tildify(worktree.path))}`
		);
	}
	for (const { worktree, reason } of plan.skipped) {
		prompts.log.warn(`Kept ${worktree.branch}: ${reason}.`);
	}
	if (pullNote) prompts.log.warn(pullNote);
}
