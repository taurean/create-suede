#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { KICKOFF_BRANCH, bootstrapSteps } from './bootstrap.ts';
import { parseChronver, todayChronver } from './chronver.ts';
import { isInstalled } from './exec.ts';
import { findMissingTools, REQUIRED_TOOLS } from './preflight.ts';
import { validateProjectName } from './project-name.ts';
import { createRemote, type Visibility } from './remote.ts';
import { resolveLatestTag } from './template.ts';

const USAGE = `Usage: pnpm create suede [name]

Creates ~/Developer/<name>/main from the latest suede release.

Options:
  -h, --help   Show this message`;

function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
	if (prompts.isCancel(value)) {
		prompts.cancel('Cancelled.');
		process.exit(0);
	}
	return value as Exclude<T, symbol>;
}

function projectDirFor(name: string): string {
	return join(homedir(), 'Developer', name, 'main');
}

function validateDestination(name: string | undefined): string | undefined {
	const nameError = validateProjectName(name);
	if (nameError || !name) return nameError;
	return existsSync(projectDirFor(name)) ? `${projectDirFor(name)} already exists.` : undefined;
}

async function main(): Promise<void> {
	const args = parse(process.argv.slice(2), { boolean: ['help'], alias: { h: 'help' } });
	if (args.help) {
		console.log(USAGE);
		return;
	}

	const missing = await findMissingTools();
	if (missing.length > 0) {
		const lines = missing.map((tool) => `${tool}: ${REQUIRED_TOOLS[tool]}`);
		prompts.log.error(
			`Missing required tools. Install them and run this again.\n${lines.join('\n')}`
		);
		process.exit(1);
	}

	prompts.intro('create-suede');

	const argumentName = args._[0] === undefined ? undefined : String(args._[0]);
	const argumentError =
		argumentName === undefined ? undefined : await validateDestination(argumentName);
	if (argumentError) prompts.log.warn(argumentError);

	const name =
		argumentName && !argumentError
			? argumentName
			: exitIfCancelled(
					await prompts.text({
						message: 'Project name',
						placeholder: 'my-project',
						validate: validateDestination
					})
				);
	const projectDir = projectDirFor(name);

	const description = exitIfCancelled(
		await prompts.text({
			message: 'One-line purpose',
			placeholder: 'What this project is for, in plain English',
			validate: (value) => (value?.trim() ? undefined : 'A one-line purpose is required.')
		})
	).trim();

	const today = todayChronver();
	const version = exitIfCancelled(
		await prompts.text({
			message: 'First version',
			placeholder: today,
			defaultValue: today,
			validate: (value) =>
				!value || parseChronver(value) ? undefined : 'Use chronver: YYYY.M.D[.N], no leading zeros.'
		})
	);

	const spinner = prompts.spinner();
	spinner.start('Finding the latest suede release');
	let suedeTag: string;
	let suedeCommit: string;
	try {
		({ tag: suedeTag, commit: suedeCommit } = await resolveLatestTag());
		spinner.stop(`Using suede ${suedeTag} (${suedeCommit.slice(0, 7)})`);
	} catch (error) {
		spinner.error('Could not reach the suede repository');
		throw error;
	}

	for (const step of bootstrapSteps(
		projectDir,
		{ name, version, description, suedeTag },
		suedeCommit
	)) {
		spinner.start(step.title);
		try {
			await step.run();
			spinner.stop(step.title);
		} catch (error) {
			spinner.error(step.title);
			prompts.log.error(
				`${(error as Error).message}\n\nThe partial project is left at ${projectDir}.`
			);
			process.exit(1);
		}
	}

	if (await isInstalled('gh')) {
		const wantsRemote = exitIfCancelled(
			await prompts.confirm({ message: 'Create a GitHub repository?' })
		);
		if (wantsRemote) {
			const visibility = exitIfCancelled(
				await prompts.select<Visibility>({
					message: 'Visibility',
					options: [
						{ value: 'private', label: 'Private' },
						{ value: 'public', label: 'Public', hint: 'anyone can see it' }
					],
					initialValue: 'private'
				})
			);
			spinner.start('Creating the GitHub repository');
			try {
				const url = await createRemote(projectDir, name, visibility);
				spinner.stop(`Pushed main to ${url}`);
			} catch (error) {
				spinner.error('Could not create the GitHub repository');
				prompts.log.warn(
					`${(error as Error).message}\n\nThe project is fine locally; add a remote later.`
				);
			}
		}
	} else {
		prompts.log.info('gh is not installed, so no GitHub repository was created.');
	}

	prompts.note(
		[`cd ${projectDir}`, 'claude', '/suede-kickoff'].join('\n'),
		`Next, on ${KICKOFF_BRANCH}`
	);
	prompts.outro(`suede ${suedeTag} (${suedeCommit.slice(0, 7)}) is ready.`);
}

main().catch((error: unknown) => {
	prompts.log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
