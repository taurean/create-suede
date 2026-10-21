import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { run } from './exec.ts';
import { commit, createBranch, initRepository, stageFiles } from './git.ts';
import {
	applyToPackageJson,
	applyToDemoPage,
	applyToPackageLock,
	applyToWranglerConfig,
	detectIndent,
	type ProjectFields
} from './manifest.ts';
import { downloadTemplate, listFiles } from './template.ts';

export const KICKOFF_BRANCH = 'chore/suede-kickoff';

export interface BootstrapStep {
	title: string;
	run: () => Promise<void>;
}

async function pathExists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false
	);
}

async function rewriteJson(
	path: string,
	transform: (value: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
	const source = await readFile(path, 'utf8');
	const updated = transform(JSON.parse(source));
	await writeFile(path, JSON.stringify(updated, null, detectIndent(source)) + '\n');
}

/** The ordered steps that turn an empty directory into a bootstrapped suede fork. */
export function bootstrapSteps(
	projectDir: string,
	fields: ProjectFields,
	suedeCommit: string
): BootstrapStep[] {
	let templateFiles: string[] = [];

	return [
		{
			title: `Downloading suede ${fields.suedeTag}`,
			run: async () => {
				await mkdir(dirname(projectDir), { recursive: true });
				await downloadTemplate(fields.suedeTag, projectDir);
				templateFiles = await listFiles(projectDir);
			}
		},
		{
			title: 'Initializing git',
			run: () => initRepository(projectDir)
		},
		{
			title: 'Naming the project',
			run: async () => {
				await rewriteJson(join(projectDir, 'package.json'), (manifest) =>
					applyToPackageJson(manifest, fields)
				);
				const lockPath = join(projectDir, 'package-lock.json');
				if (await pathExists(lockPath)) {
					await rewriteJson(lockPath, (lock) => applyToPackageLock(lock, fields));
				}
				const wranglerPath = join(projectDir, 'wrangler.jsonc');
				if (await pathExists(wranglerPath)) {
					const source = await readFile(wranglerPath, 'utf8');
					await writeFile(wranglerPath, applyToWranglerConfig(source, fields.name));
				}
				const demoPagePath = join(projectDir, 'src/routes/+page.svelte');
				if (await pathExists(demoPagePath)) {
					const source = await readFile(demoPagePath, 'utf8');
					await writeFile(demoPagePath, applyToDemoPage(source, fields.name, fields.description));
				}
			}
		},
		{
			title: 'Installing dependencies',
			run: async () => {
				await run('pnpm', ['install'], projectDir);
			}
		},
		{
			title: 'Committing the bootstrap',
			run: async () => {
				await stageFiles(projectDir, templateFiles);
				await commit(
					projectDir,
					`chore: bootstrap from suede ${fields.suedeTag}\n\nsuede commit: ${suedeCommit}`
				);
			}
		},
		{
			title: `Creating ${KICKOFF_BRANCH}`,
			run: () => createBranch(projectDir, KICKOFF_BRANCH)
		}
	];
}
