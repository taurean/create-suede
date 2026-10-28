import * as prompts from '@clack/prompts';
import { isInstalled, run } from './exec.ts';
import { lookup, type Lookup } from './lookup.ts';
import { findGitRoot, NOT_A_GIT_REPO } from './project.ts';
import { paint, tildify } from './style.ts';
import { hasOrigin, isDirty, listWorktrees, mergedTaskBranches } from './worktree.ts';

export const STATUS_USAGE = 'Lists task worktrees: uncommitted, merged, and their open PRs.';

export interface TaskWorktree {
	path: string;
	/** Short branch name, or undefined for a detached HEAD. */
	branch: string | undefined;
	dirty: boolean;
	/** Merged into the base with commits of its own, so `suede done` would remove it. */
	merged: boolean;
}

export interface StatusReport {
	/** The main checkout's path. */
	main: string;
	tasks: TaskWorktree[];
}

/**
 * Reads every task worktree beside the main checkout, from any of them. Fetches
 * `origin` first, without pruning, so a branch merged on GitHub reads as merged.
 */
export async function collectStatus(gitRoot: string): Promise<StatusReport> {
	// Lists the main checkout first, whichever worktree gitRoot is.
	const [main, ...worktrees] = await listWorktrees(gitRoot);
	if (!main) throw new Error('git worktree list returned nothing.');

	const remote = await hasOrigin(main.path);
	if (remote) await run('git', ['fetch', '--quiet', 'origin'], main.path);
	const merged = await mergedTaskBranches(main.path, remote ? 'origin/main' : 'main');

	const tasks: TaskWorktree[] = [];
	for (const worktree of worktrees) {
		tasks.push({
			...worktree,
			dirty: await isDirty(worktree.path),
			merged: worktree.branch !== undefined && merged.has(worktree.branch)
		});
	}
	return { main: main.path, tasks };
}

export type Checks = 'passing' | 'failing' | 'pending' | 'none';

export interface PullRequest {
	number: number;
	branch: string;
	draft: boolean;
	checks: Checks;
}

/** One entry of gh's `statusCheckRollup`: a check run (Actions) or a commit status (older CI). */
export type RollupEntry =
	| { __typename: 'CheckRun'; status: string; conclusion: string }
	| { __typename: 'StatusContext'; state: string };

const FAILING = new Set([
	'FAILURE',
	'ERROR',
	'CANCELLED',
	'TIMED_OUT',
	'ACTION_REQUIRED',
	'STARTUP_FAILURE'
]);
const PENDING = new Set(['PENDING', 'EXPECTED']);

/**
 * One word for a PR's checks. A check run is unfinished until `status` is
 * COMPLETED, then its `conclusion` is SUCCESS, FAILURE, CANCELLED, TIMED_OUT,
 * ACTION_REQUIRED, STARTUP_FAILURE, NEUTRAL, SKIPPED or STALE. A commit status's
 * `state` is SUCCESS, FAILURE, ERROR, PENDING or EXPECTED.
 *
 * Matches the verdict GitHub shows on the PR: any failure wins over anything
 * unfinished, which wins over success. NEUTRAL, SKIPPED and STALE don't block a
 * merge on GitHub, so they count as passing.
 */
export function summarizeChecks(rollup: RollupEntry[]): Checks {
	if (rollup.length === 0) return 'none';
	const outcomes = rollup.map((entry) => {
		if (entry.__typename === 'StatusContext') return entry.state;
		return entry.status === 'COMPLETED' ? entry.conclusion : 'PENDING';
	});
	if (outcomes.some((outcome) => FAILING.has(outcome))) return 'failing';
	if (outcomes.some((outcome) => PENDING.has(outcome))) return 'pending';
	return 'passing';
}

/** Parses `gh pr list --json number,headRefName,isDraft,statusCheckRollup`. */
export function parsePullRequests(json: string): PullRequest[] {
	const entries = JSON.parse(json) as {
		number: number;
		headRefName: string;
		isDraft: boolean;
		statusCheckRollup: RollupEntry[];
	}[];
	return entries.map((entry) => ({
		number: entry.number,
		branch: entry.headRefName,
		draft: entry.isDraft,
		checks: summarizeChecks(entry.statusCheckRollup)
	}));
}

// gh's own default is 30; a project with more open PRs than this lists only the newest.
const PULL_REQUEST_LIMIT = 100;

async function fetchPullRequests(cwd: string): Promise<PullRequest[]> {
	if (!(await isInstalled('gh'))) throw new Error("gh isn't installed");
	return parsePullRequests(
		await run(
			'gh',
			[
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				String(PULL_REQUEST_LIMIT),
				'--json',
				'number,headRefName,isDraft,statusCheckRollup'
			],
			cwd
		)
	);
}

const DETACHED = '(detached HEAD)';

const CHECKS_TEXT: Record<Checks, string> = {
	passing: paint('green', 'checks passing'),
	failing: paint('red', 'checks failing'),
	pending: paint('yellow', 'checks pending'),
	none: paint('dim', 'no checks')
};

function pullRequestNote(pr: PullRequest): string {
	return `#${pr.number} ${pr.draft ? 'draft' : 'ready'}, ${CHECKS_TEXT[pr.checks]}`;
}

function taskLine(task: TaskWorktree, width: number, pr: PullRequest | undefined): string {
	const notes: string[] = [];
	if (task.dirty) notes.push(paint('yellow', 'uncommitted changes'));
	if (task.merged) notes.push(paint('green', 'merged, ready for suede done'));
	if (pr) notes.push(pullRequestNote(pr));
	const name = (task.branch ?? DETACHED).padEnd(width);
	return [`${name}  ${paint('dim', tildify(task.path))}`, ...notes].join(paint('dim', ' · '));
}

/** Worktree lines, each with its branch's open PR, then the open PRs no worktree has. */
export function formatStatus(report: StatusReport, pullRequests: Lookup<PullRequest[]>): string {
	const open = pullRequests.ok ? pullRequests.value : [];
	const byBranch = new Map(open.map((pr) => [pr.branch, pr]));
	const width = Math.max(0, ...report.tasks.map((task) => (task.branch ?? DETACHED).length));
	const lines = report.tasks.map((task) =>
		taskLine(task, width, task.branch === undefined ? undefined : byBranch.get(task.branch))
	);

	const branches = new Set(report.tasks.map((task) => task.branch));
	const unmatched = open.filter((pr) => !branches.has(pr.branch));
	if (unmatched.length > 0) {
		const numberWidth = Math.max(...unmatched.map((pr) => String(pr.number).length)) + 1;
		const branchWidth = Math.max(...unmatched.map((pr) => pr.branch.length));
		if (lines.length > 0) lines.push('');
		lines.push(paint('dim', 'Open PRs without a worktree'));
		for (const pr of unmatched) {
			const number = `#${pr.number}`.padEnd(numberWidth);
			const status = `${pr.draft ? 'draft' : 'ready'}, ${CHECKS_TEXT[pr.checks]}`;
			lines.push(`${number}  ${pr.branch.padEnd(branchWidth)}  ${status}`);
		}
	}
	if (!pullRequests.ok) {
		if (lines.length > 0) lines.push('');
		lines.push(paint('yellow', `PRs unavailable: ${pullRequests.reason}`));
	}
	return lines.join('\n');
}

export async function runStatus(): Promise<void> {
	const gitRoot = findGitRoot(process.cwd());
	if (!gitRoot) throw new Error(NOT_A_GIT_REPO);

	const spinner = prompts.spinner();
	spinner.start('Reading task worktrees and open PRs');
	let report: StatusReport;
	let pullRequests: Lookup<PullRequest[]>;
	try {
		[report, pullRequests] = await Promise.all([
			collectStatus(gitRoot),
			lookup('gh', () => fetchPullRequests(gitRoot))
		]);
	} catch (error) {
		spinner.error('Could not read task worktrees');
		throw error;
	}

	const count = report.tasks.length;
	spinner.stop(
		count === 0
			? `No task worktrees beside ${tildify(report.main)}`
			: `${count} task worktree${count === 1 ? '' : 's'}`
	);
	const output = formatStatus(report, pullRequests);
	if (output) prompts.log.message(output);
}
