import { describe, expect, it } from 'vitest';
import {
	parseWorktreeList,
	planRemovals,
	siblingPath,
	validateTaskBranch,
	worktreeDirName
} from './worktree.ts';

describe('validateTaskBranch', () => {
	it('accepts <type>/<slug> and rejects other shapes', () => {
		expect(validateTaskBranch('feat/login')).toBeUndefined();
		expect(validateTaskBranch('fix/18-null-user')).toBeUndefined();
		expect(validateTaskBranch(undefined)).toBeDefined();
		expect(validateTaskBranch('login')).toBeDefined();
		expect(validateTaskBranch('feat/Login')).toBeDefined();
		expect(validateTaskBranch('feat/a/b')).toBeDefined();
	});
});

describe('worktree paths', () => {
	it('puts the worktree beside main/, named after the branch', () => {
		expect(worktreeDirName('feat/login')).toBe('feat-login');
		expect(siblingPath('/home/me/Developer/app/main', 'feat/login')).toBe(
			'/home/me/Developer/app/feat-login'
		);
	});
});

describe('parseWorktreeList', () => {
	it('reads paths and branches, including detached worktrees', () => {
		const porcelain = [
			'worktree /d/app/main\nHEAD aaa\nbranch refs/heads/main',
			'worktree /d/app/feat-login\nHEAD bbb\nbranch refs/heads/feat/login',
			'worktree /d/app/scratch\nHEAD ccc\ndetached',
			''
		].join('\n\n');
		expect(parseWorktreeList(porcelain)).toEqual([
			{ path: '/d/app/main', branch: 'main' },
			{ path: '/d/app/feat-login', branch: 'feat/login' },
			{ path: '/d/app/scratch', branch: undefined }
		]);
	});
});

describe('planRemovals', () => {
	const worktrees = [
		{ path: '/d/app/main', branch: 'main' },
		{ path: '/d/app/feat-a', branch: 'feat/a' },
		{ path: '/d/app/feat-b', branch: 'feat/b' },
		{ path: '/d/app/feat-c', branch: 'feat/c' },
		{ path: '/d/app/feat-d', branch: 'feat/d' },
		{ path: '/d/app/detached', branch: undefined }
	];
	const merged = new Set(['main', 'feat/a', 'feat/b', 'feat/c']);

	it('removes merged, clean worktrees and keeps everything else', () => {
		const plan = planRemovals(worktrees, merged, new Set(['/d/app/feat-b']), '/d/app/feat-c/src');
		expect(plan.remove.map((worktree) => worktree.branch)).toEqual(['feat/a']);
		expect(plan.skipped.map(({ worktree, reason }) => [worktree.branch, reason])).toEqual([
			['feat/b', 'has uncommitted changes'],
			['feat/c', "you're inside it; run suede done from main/"]
		]);
	});

	it('never removes the main checkout, even though main is merged', () => {
		const plan = planRemovals(worktrees, merged, new Set(), '/d/app/main');
		expect(plan.remove.map((worktree) => worktree.path)).not.toContain('/d/app/main');
	});

	it('does not treat a path that merely shares a prefix as inside', () => {
		const plan = planRemovals(worktrees, merged, new Set(), '/d/app/feat-ab');
		expect(plan.remove.map((worktree) => worktree.branch)).toContain('feat/a');
	});
});
