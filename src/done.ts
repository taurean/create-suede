import { realpathSync } from 'node:fs';
import * as prompts from '@clack/prompts';
import { run } from './exec.ts';
import { findGitRoot, NOT_A_GIT_REPO } from './project.ts';
import { paint, tildify } from './style.ts';
import {
	hasOrigin,
	isDirty,
	listWorktrees,
	mergedTaskBranches,
	planRemovals,
	removeWorktrees
} from './worktree.ts';

export const DONE_USAGE = 'Removes worktrees whose branches are merged, then pulls main.';

export async function runDone(): Promise<void> {
	const gitRoot = findGitRoot(process.cwd());
	if (!gitRoot) throw new Error(NOT_A_GIT_REPO);

	// Lists the main checkout first, whichever worktree gitRoot is.
	const worktrees = await listWorktrees(gitRoot);
	const [main] = worktrees;
	if (!main) throw new Error('git worktree list returned nothing.');

	const spinner = prompts.spinner();
	const remote = await hasOrigin(main.path);
	spinner.start(remote ? 'Fetching origin' : 'Checking merged branches');
	if (remote) await run('git', ['fetch', '--quiet', '--prune', 'origin'], main.path);
	const base = remote ? 'origin/main' : 'main';

	const merged = await mergedTaskBranches(main.path, base);
	const dirty = new Set<string>();
	for (const worktree of worktrees.slice(1)) {
		if (worktree.branch && merged.has(worktree.branch) && (await isDirty(worktree.path))) {
			dirty.add(worktree.path);
		}
	}
	const plan = planRemovals(worktrees, merged, dirty, realpathSync(process.cwd()));

	const { removed, failed } = await removeWorktrees(main.path, plan.remove, (worktree) =>
		spinner.message(`Removing ${worktree.branch}`)
	);

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

	const count = removed.length;
	spinner.stop(
		plan.remove.length === 0
			? 'No merged worktrees to remove'
			: `Removed ${count} merged worktree${count === 1 ? '' : 's'}`
	);
	for (const worktree of removed) {
		prompts.log.message(
			`${paint('dim', '−')} ${worktree.branch} ${paint('dim', tildify(worktree.path))}`
		);
	}
	for (const { worktree, reason } of plan.skipped) {
		prompts.log.warn(`Kept ${worktree.branch}: ${reason}.`);
	}
	for (const { worktree, error } of failed) {
		prompts.log.error(`Couldn't remove ${worktree.branch}: ${error}`);
	}
	if (pullNote) prompts.log.warn(pullNote);
	if (failed.length > 0) process.exitCode = 1;
}
