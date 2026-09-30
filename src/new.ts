import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as prompts from '@clack/prompts';
import { KICKOFF_BRANCH, bootstrapSteps } from './bootstrap.ts';
import { isInstalled } from './exec.ts';
import { findMissingTools, REQUIRED_TOOLS } from './preflight.ts';
import { validateProjectName } from './project-name.ts';
import { createRemote, type Visibility } from './remote.ts';
import { paint, tildify, wordmark } from './style.ts';
import { resolveLatestTag } from './template.ts';
import { defaultVersion, validateVersion, type Versioning } from './versioning.ts';

export const NEW_USAGE = 'Creates ~/Developer/<name>/main from the latest suede release.';

type RemoteChoice = Visibility | 'none';

function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
	if (prompts.isCancel(value)) {
		prompts.cancel('Cancelled. Nothing was created.');
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
	const projectDir = projectDirFor(name);
	return existsSync(projectDir) ? `${tildify(projectDir)} already exists.` : undefined;
}

async function askName(argumentName: string | undefined): Promise<string> {
	const argumentError = argumentName === undefined ? undefined : validateDestination(argumentName);
	if (argumentName && !argumentError) return argumentName;
	if (argumentError) prompts.log.warn(argumentError);
	return exitIfCancelled(
		await prompts.text({
			message: 'Project name',
			placeholder: 'my-project',
			validate: validateDestination
		})
	);
}

async function askRemote(): Promise<RemoteChoice> {
	if (!(await isInstalled('gh'))) {
		prompts.log.info('gh is not installed, so no GitHub repository will be created.');
		return 'none';
	}
	return exitIfCancelled(
		await prompts.select<RemoteChoice>({
			message: 'GitHub repository',
			options: [
				{ value: 'private', label: 'Private' },
				{ value: 'public', label: 'Public', hint: 'anyone can see it' },
				{ value: 'none', label: 'None', hint: 'add a remote later' }
			],
			initialValue: 'private'
		})
	);
}

export async function runNew(argumentName: string | undefined): Promise<void> {
	const missing = await findMissingTools();
	if (missing.length > 0) {
		const lines = missing.map((tool) => `${tool}: ${REQUIRED_TOOLS[tool]}`);
		prompts.log.error(
			`Missing required tools. Install them and run this again.\n${lines.join('\n')}`
		);
		process.exit(1);
	}

	console.log(`\n${wordmark()}\n`);
	prompts.intro(paint('dim', 'new project'));

	const name = await askName(argumentName);
	const projectDir = projectDirFor(name);

	const description = exitIfCancelled(
		await prompts.text({
			message: 'One-line purpose',
			placeholder: 'What this project is for, in plain English',
			validate: (value) => (value?.trim() ? undefined : 'A one-line purpose is required.')
		})
	).trim();

	const versioning = exitIfCancelled(
		await prompts.select<Versioning>({
			message: 'Versioning',
			options: [
				{ value: 'chronver', label: 'Chronver', hint: 'apps and sites · YYYY.M.D' },
				{ value: 'semver', label: 'Semver', hint: 'libraries with dependents · MAJOR.MINOR.PATCH' }
			],
			initialValue: 'chronver'
		})
	);

	const suggestedVersion = defaultVersion(versioning);
	const version = exitIfCancelled(
		await prompts.text({
			message: 'First version',
			placeholder: suggestedVersion,
			defaultValue: suggestedVersion,
			validate: (value) => (value ? validateVersion(versioning, value) : undefined)
		})
	);

	const remote = await askRemote();

	const spinner = prompts.spinner({ indicator: 'timer' });
	spinner.start('Finding the latest suede release');
	let suedeTag = '';
	let currentStep = 'Finding the latest suede release';
	let remoteUrl: string | undefined;
	let remoteError: string | undefined;
	try {
		const latest = await resolveLatestTag();
		suedeTag = latest.tag;
		const steps = bootstrapSteps(
			projectDir,
			{ name, version, versioning, description, suedeTag },
			latest.commit
		);
		for (const step of steps) {
			currentStep = step.title;
			spinner.message(step.title);
			await step.run();
		}
		if (remote !== 'none') {
			spinner.message('Creating the GitHub repository');
			remoteUrl = await createRemote(projectDir, name, remote).catch((error: Error) => {
				remoteError = error.message;
				return undefined;
			});
		}
	} catch (error) {
		spinner.error(`${currentStep} failed`);
		const leftover = existsSync(projectDir)
			? `\n\nThe partial project is at ${tildify(projectDir)}.`
			: '';
		prompts.log.error(`${(error as Error).message}${leftover}`);
		process.exit(1);
	}
	spinner.stop(`Created ${paint('bold', name)} from suede ${paint('cyan', suedeTag)}`);

	if (remoteError) {
		prompts.log.warn(
			`Could not create the GitHub repository:\n${remoteError}\n\nThe project is fine locally; add a remote later.`
		);
	}

	prompts.note(
		[`cd ${tildify(projectDir)}`, 'claude', '/suede-kickoff']
			.map((line) => paint('cyan', line))
			.join('\n'),
		`Next, on ${KICKOFF_BRANCH}`
	);
	prompts.outro(remoteUrl ? paint('underline', remoteUrl) : paint('dim', tildify(projectDir)));
}
