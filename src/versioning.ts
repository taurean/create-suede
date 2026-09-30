import { parseChronver, todayChronver } from './chronver.ts';

export type Versioning = 'chronver' | 'semver';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

export function defaultVersion(versioning: Versioning, date = new Date()): string {
	return versioning === 'chronver' ? todayChronver(date) : '0.1.0';
}

/** Returns an error message, or undefined when the version fits the scheme. */
export function validateVersion(versioning: Versioning, version: string): string | undefined {
	if (versioning === 'chronver') {
		return parseChronver(version) ? undefined : 'Use chronver: YYYY.M.D[.N], no leading zeros.';
	}
	return SEMVER_PATTERN.test(version) ? undefined : 'Use semver: MAJOR.MINOR.PATCH, e.g. 0.1.0.';
}
