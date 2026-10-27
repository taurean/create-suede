import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as prompts from '@clack/prompts';
import { daysBetween, parseChronver, releasesBehind, type ChronverTag } from './chronver.ts';
import { findProjectRoot, NOT_A_PROJECT } from './project.ts';
import { paint } from './style.ts';
import {
	fetchTemplateTags,
	latestTemplateTag,
	TEMPLATE_REPO,
	templateChangelog
} from './template.ts';

export const STATUS_USAGE = 'Shows how far this project is behind the latest suede.';

export interface Drift {
	latest: string;
	releases: number;
	days: number;
}

/** How far `from` is behind the newest of suede's `tags`. `from` must be one of them. */
export function measureDrift(from: string, tags: ChronverTag[]): Drift {
	const fromVersion = parseChronver(from);
	if (!fromVersion) throw new Error(`suede.from "${from}" isn't a chronver tag.`);
	if (!tags.some((tag) => tag.tag === from)) {
		throw new Error(`suede.from ${from} isn't a tag on ${TEMPLATE_REPO}.`);
	}
	const latest = latestTemplateTag(tags);
	return {
		latest: latest.tag,
		releases: releasesBehind(fromVersion, tags),
		days: daysBetween(fromVersion, latest.version)
	};
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export async function runStatus(): Promise<void> {
	const root = findProjectRoot(process.cwd());
	if (!root) throw new Error(NOT_A_PROJECT);
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const from = (manifest as { suede: { from: string } }).suede.from;

	const spinner = prompts.spinner();
	spinner.start(`Resolving ${TEMPLATE_REPO} tags`);
	let drift: Drift;
	let changelog: string[] = [];
	try {
		drift = measureDrift(from, await fetchTemplateTags());
		if (drift.releases > 0) {
			spinner.message('Reading the changelog');
			changelog = await templateChangelog(from, drift.latest);
		}
	} catch (error) {
		spinner.error('Could not measure drift from suede');
		throw error;
	}

	if (drift.releases === 0) {
		spinner.stop(`suede.from ${paint('bold', from)} is the latest suede`);
		return;
	}
	spinner.stop(
		`${plural(drift.releases, 'release')} and ${plural(drift.days, 'day')} behind suede ${paint('bold', drift.latest)}`
	);
	prompts.log.message(`${paint('dim', 'suede.from')}  ${from}`);
	prompts.log.message(
		changelog
			.map((line) => {
				const [hash, ...subject] = line.split(' ');
				return `${paint('dim', hash ?? '')} ${subject.join(' ')}`;
			})
			.join('\n')
	);
}
