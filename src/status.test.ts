import { describe, expect, it } from 'vitest';
import { formatStatus, parsePullRequests, type StatusReport } from './status.ts';

const report: StatusReport = {
	main: '/Users/a/Developer/app/main',
	tasks: [
		{
			path: '/Users/a/Developer/app/feat-login',
			branch: 'feat/login',
			dirty: false,
			merged: false
		},
		{
			path: '/Users/a/Developer/app/fix-typo',
			branch: 'fix/typo',
			dirty: false,
			merged: false
		},
		{
			path: '/Users/a/Developer/app/chore-deps',
			branch: 'chore/deps',
			dirty: false,
			merged: false
		}
	]
};

const ghOutput = JSON.stringify([
	{
		number: 12,
		headRefName: 'feat/login',
		isDraft: true,
		statusCheckRollup: [
			{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null },
			{ __typename: 'StatusContext', state: 'FAILURE' }
		]
	},
	{
		number: 13,
		headRefName: 'fix/typo',
		isDraft: false,
		statusCheckRollup: [
			{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
			{ __typename: 'StatusContext', state: 'SUCCESS' }
		]
	},
	{
		number: 20,
		headRefName: 'docs/readme',
		isDraft: false,
		statusCheckRollup: [
			{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
			{ __typename: 'StatusContext', state: 'PENDING' }
		]
	},
	{
		number: 21,
		headRefName: 'refactor/cli',
		isDraft: false,
		statusCheckRollup: []
	}
]);

function lineIndex(lines: string[], text: string): number {
	const matches = lines.flatMap((line, index) => (line.includes(text) ? [index] : []));
	expect(matches, `exactly one line containing ${text}`).toHaveLength(1);
	return matches[0] ?? -1;
}

describe('suede status', () => {
	it('shows each open PR on its worktree line, then the PRs no worktree has, one line each', () => {
		const output = formatStatus(report, { ok: true, value: parsePullRequests(ghOutput) });
		const lines = output.split('\n');

		const login = lineIndex(lines, 'feat/login');
		const typo = lineIndex(lines, 'fix/typo');
		const deps = lineIndex(lines, 'chore/deps');

		expect(lines[login]).toContain('#12 draft, checks failing');
		expect(lines[typo]).toContain('#13 ready, checks passing');
		expect(lines[deps]).not.toContain('#');

		const lastWorktree = Math.max(login, typo, deps);
		const readme = lineIndex(lines, '#20');
		const cli = lineIndex(lines, '#21');

		expect(lines[readme]).toContain('#20 ready, checks pending');
		expect(lines[cli]).toContain('#21 ready, no checks');
		expect(readme).toBeGreaterThan(lastWorktree);
		expect(cli).toBeGreaterThan(lastWorktree);
		expect(readme).not.toBe(cli);
	});

	it.each(['gh is not installed', 'gh is not signed in: run gh auth login'])(
		'lists the worktrees and one line saying PRs are unavailable when %s',
		(reason) => {
			const output = formatStatus(report, { ok: false, reason });
			const lines = output.split('\n');

			for (const branch of ['feat/login', 'fix/typo', 'chore/deps']) {
				expect(lines[lineIndex(lines, branch)]).not.toContain('#');
			}
			expect(lines[lineIndex(lines, 'PRs unavailable')]).toContain(`PRs unavailable: ${reason}`);
		}
	);
});
