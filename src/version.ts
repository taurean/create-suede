import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { lookup, type Lookup } from './lookup.ts';
import { findProjectRoot } from './project.ts';
import { paint } from './style.ts';
import {
	type Drift,
	fetchTemplateTags,
	latestTemplateTag,
	measureDrift,
	TEMPLATE_REPO
} from './template.ts';
import { compareSemver } from './versioning.ts';

const PACKAGE_NAME = 'create-suede';
const REGISTRY_URL = `https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`;
const REGISTRY_TIMEOUT_MS = 5000;

export interface VersionReport {
	installed: string;
	npmLatest: Lookup<string>;
	suedeLatest: Lookup<string>;
	/** The project around the current directory, if any: its `suede.from` and how far behind it is. */
	project: { from: string; drift: Lookup<Drift> } | undefined;
	upgradeCommand: string;
}

/** The installed package's own version. The bundle sits in dist/, one level below package.json. */
function installedVersion(): string {
	const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	return (manifest as { version: string }).version;
}

/**
 * The global-install command matching where the running binary lives:
 * Volta keeps packages under ~/.volta, pnpm under its `pnpm/global` directory.
 */
export function upgradeCommand(binaryPath: string): string {
	const path = binaryPath.split('\\').join('/');
	if (path.includes('/.volta/')) return `volta install ${PACKAGE_NAME}@latest`;
	if (path.includes('/pnpm/global/')) return `pnpm add -g ${PACKAGE_NAME}@latest`;
	return `npm install -g ${PACKAGE_NAME}@latest`;
}

async function fetchNpmLatest(): Promise<string> {
	const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const { latest } = (await response.json()) as { latest?: unknown };
	if (typeof latest !== 'string') throw new Error('no "latest" dist-tag');
	return latest;
}

function readProjectFrom(): string | undefined {
	const root = findProjectRoot(process.cwd());
	if (!root) return undefined;
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	return (manifest as { suede: { from: string } }).suede.from;
}

function row(label: string, value: string): string {
	return `${paint('dim', label.padEnd(14))}${value}`;
}

function lookupValue(result: Lookup<string>): string {
	return result.ok ? result.value : paint('yellow', `unavailable: ${result.reason}`);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function driftNote(drift: Lookup<Drift>): string {
	if (!drift.ok) return paint('yellow', `drift unavailable: ${drift.reason}`);
	const { releases, days } = drift.value;
	if (releases === 0) return paint('dim', 'the latest suede');
	return `${paint('yellow', `${plural(releases, 'release')} and ${plural(days, 'day')} behind`)}  ${paint('dim', 'suede update brings it in')}`;
}

export function formatVersionReport(report: VersionReport): string {
	const lines = [
		row(PACKAGE_NAME, report.installed),
		row('npm latest', lookupValue(report.npmLatest)),
		row('suede latest', lookupValue(report.suedeLatest))
	];
	if (report.project !== undefined) {
		lines.push(row('suede.from', `${report.project.from}  ${driftNote(report.project.drift)}`));
	}
	if (!report.npmLatest.ok) return lines.join('\n');
	const latest = report.npmLatest.value;
	const order = compareSemver(report.installed, latest);
	if (order === undefined) {
		lines.push(
			'',
			paint('yellow', `Can't compare ${report.installed} with npm's ${latest}: not plain semver.`)
		);
	} else if (order < 0) {
		lines.push(
			'',
			`${paint('yellow', `${report.installed} is behind npm's ${latest}.`)} Upgrade with ${paint('cyan', report.upgradeCommand)}`
		);
	}
	return lines.join('\n');
}

/** Applies `read` to a lookup's value, turning a throw into the failure's reason. */
function derive<T, U>(result: Lookup<T>, read: (value: T) => U): Lookup<U> {
	if (!result.ok) return result;
	try {
		return { ok: true, value: read(result.value) };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

/** Prints the version report. Unreachable lookups are reported, never fatal. */
export async function runVersion(): Promise<void> {
	const [npmLatest, tags] = await Promise.all([
		lookup('registry.npmjs.org', fetchNpmLatest),
		lookup(`github.com/${TEMPLATE_REPO}`, fetchTemplateTags)
	]);
	// One ls-remote serves both the latest tag and the drift; neither makes its own call.
	const suedeLatest = derive(tags, (value) => latestTemplateTag(value).tag);
	const from = readProjectFrom();
	const project =
		from === undefined
			? undefined
			: { from, drift: derive(tags, (value) => measureDrift(from, value)) };
	const script = process.argv[1];
	if (!script) throw new Error("process.argv[1] is empty, so the CLI can't locate its install.");
	console.log(
		formatVersionReport({
			installed: installedVersion(),
			npmLatest,
			suedeLatest,
			project,
			upgradeCommand: upgradeCommand(realpathSync(script))
		})
	);
}
