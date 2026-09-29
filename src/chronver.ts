const CHRONVER_PATTERN = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d+))?(?:-([a-z]+))?$/;

export interface Chronver {
	year: number;
	month: number;
	day: number;
	changeset: number;
	label: string | undefined;
}

export function parseChronver(value: string): Chronver | undefined {
	const match = CHRONVER_PATTERN.exec(value);
	if (!match) return undefined;
	const [, year, month, day, changeset, label] = match;
	const parsed = {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		changeset: changeset === undefined ? 0 : Number(changeset),
		label
	};
	const hasLeadingZero = [month, day].some((part) => part?.startsWith('0'));
	const isValidDate =
		parsed.month >= 1 && parsed.month <= 12 && parsed.day >= 1 && parsed.day <= 31;
	return hasLeadingZero || !isValidDate ? undefined : parsed;
}

export function compareChronver(a: Chronver, b: Chronver): number {
	return a.year - b.year || a.month - b.month || a.day - b.day || a.changeset - b.changeset;
}

export function todayChronver(date = new Date()): string {
	return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

/** Picks the newest chronver tag from `git ls-remote --tags` output. */
export function latestChronverTag(
	lsRemoteOutput: string
): { tag: string; commit: string } | undefined {
	const tags = new Map<string, { commit: string; peeled: boolean }>();

	for (const line of lsRemoteOutput.split('\n')) {
		const [hash, ref] = line.trim().split(/\s+/);
		if (!hash || !ref?.startsWith('refs/tags/')) continue;
		const peeled = ref.endsWith('^{}');
		const tag = ref.slice('refs/tags/'.length).replace(/\^\{\}$/, '');
		// An annotated tag appears twice; the peeled (^{}) line carries the commit hash.
		if (peeled || !tags.has(tag)) tags.set(tag, { commit: hash, peeled });
	}

	let latest: { tag: string; commit: string; version: Chronver } | undefined;
	for (const [tag, { commit }] of tags) {
		const version = parseChronver(tag);
		if (version && (!latest || compareChronver(version, latest.version) > 0)) {
			latest = { tag, commit, version };
		}
	}
	return latest && { tag: latest.tag, commit: latest.commit };
}
