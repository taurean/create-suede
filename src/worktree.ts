import { dirname, join } from 'node:path';
import { run } from './exec.ts';

export interface Worktree {
	path: string;
	/** Short branch name, or undefined for a detached HEAD. */
	branch: string | undefined;
}

const TASK_BRANCH_PATTERN = /^[a-z]+\/[a-z0-9][a-z0-9-]*$/;

/** Returns an error message, or undefined when the branch fits `<type>/<slug>`. */
export function validateTaskBranch(branch: string | undefined): string | undefined {
	if (!branch) return 'A branch name is required, e.g. feat/login.';
	return TASK_BRANCH_PATTERN.test(branch)
		? undefined
		: 'Use <type>/<slug>: a lowercase type, a slash, then kebab-case (e.g. feat/login).';
}

/** `feat/login` → `feat-login`, the sibling directory name for that branch. */
export function worktreeDirName(branch: string): string {
	return branch.replace('/', '-');
}

/** Parses `git worktree list --porcelain`. The first entry is the main checkout. */
export function parseWorktreeList(porcelain: string): Worktree[] {
	return porcelain
		.split('\n\n')
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => {
			const lines = block.split('\n');
			const path =
				lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length) ?? '';
			const ref = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
			return { path, branch: ref?.replace(/^refs\/heads\//, '') };
		});
}

export interface RemovalPlan {
	remove: Worktree[];
	skipped: { worktree: Worktree; reason: string }[];
}

/**
 * Decides which task worktrees `suede done` removes: merged branches only, never
 * the main checkout, never one with uncommitted changes, never the one you're in.
 *
 * `merged` must hold only branches that did work before merging. A fresh branch
 * with no commits sits inside main too, and `git branch --merged` lists it.
 */
export function planRemovals(
	worktrees: Worktree[],
	merged: Set<string>,
	dirty: Set<string>,
	currentPath: string
): RemovalPlan {
	const plan: RemovalPlan = { remove: [], skipped: [] };
	for (const worktree of worktrees.slice(1)) {
		if (!worktree.branch || !merged.has(worktree.branch)) continue;
		if (dirty.has(worktree.path)) {
			plan.skipped.push({ worktree, reason: 'has uncommitted changes' });
		} else if (currentPath === worktree.path || currentPath.startsWith(`${worktree.path}/`)) {
			plan.skipped.push({ worktree, reason: "you're inside it; run suede done from main/" });
		} else {
			plan.remove.push(worktree);
		}
	}
	return plan;
}

export async function listWorktrees(cwd: string): Promise<Worktree[]> {
	return parseWorktreeList(await run('git', ['worktree', 'list', '--porcelain'], cwd));
}

export async function hasOrigin(cwd: string): Promise<boolean> {
	const remotes = await run('git', ['remote'], cwd);
	return remotes.split('\n').includes('origin');
}

export async function mergedBranches(cwd: string, base: string): Promise<Set<string>> {
	const output = await run('git', ['branch', '--format=%(refname:short)', '--merged', base], cwd);
	return new Set(output.split('\n').filter(Boolean));
}

/**
 * True when the branch has moved since it was created. Reads the branch reflog,
 * whose oldest entry is the creation point; a branch without a reflog (expired or
 * never recorded) counts as having moved.
 */
export async function hasOwnCommits(cwd: string, branch: string): Promise<boolean> {
	const entries = (await run('git', ['reflog', 'show', '--format=%H', `refs/heads/${branch}`], cwd))
		.split('\n')
		.filter(Boolean);
	const [tip] = entries;
	const creationPoint = entries.at(-1);
	return entries.length === 0 || tip !== creationPoint;
}

export interface RemovalResult {
	removed: Worktree[];
	failed: { worktree: Worktree; error: string }[];
}

/**
 * Removes each worktree and deletes its branch, continuing past a failure so one
 * bad worktree doesn't strand the rest.
 *
 * Deletes with `-D`: the caller's merged check against the base is the safety
 * check. `-d` would re-check against the branch's upstream, or against `HEAD` of
 * `mainPath` when there is none, and refuse a branch merged into the base but not
 * into a stale upstream or an unpulled main.
 */
export async function removeWorktrees(
	mainPath: string,
	worktrees: Worktree[],
	onRemoving?: (worktree: Worktree) => void
): Promise<RemovalResult> {
	const result: RemovalResult = { removed: [], failed: [] };
	for (const worktree of worktrees) {
		onRemoving?.(worktree);
		try {
			await run('git', ['worktree', 'remove', worktree.path], mainPath);
			await run('git', ['branch', '-D', worktree.branch ?? ''], mainPath);
			result.removed.push(worktree);
		} catch (error) {
			result.failed.push({
				worktree,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return result;
}

export async function isDirty(path: string): Promise<boolean> {
	return (await run('git', ['status', '--porcelain'], path)).trim() !== '';
}

export function siblingPath(mainPath: string, branch: string): string {
	return join(dirname(mainPath), worktreeDirName(branch));
}
