import { parseChronver, todayChronver } from './chronver.ts';

export type Versioning = 'chronver' | 'semver';
export type SemverLevel = 'patch' | 'minor' | 'major';

export const SEMVER_LEVELS: SemverLevel[] = ['patch', 'minor', 'major'];

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function defaultVersion(versioning: Versioning, date = new Date()): string {
	return versioning === 'chronver' ? todayChronver(date) : '0.1.0';
}

/**
 * The scheme a project recorded, or, for projects made before `suede.versioning`
 * existed, the one its version string uses.
 */
export function resolveVersioning(recorded: unknown, version: string): Versioning {
	if (recorded === 'chronver' || recorded === 'semver') return recorded;
	if (parseChronver(version)) return 'chronver';
	if (SEMVER_PATTERN.test(version)) return 'semver';
	throw new Error(
		`Can't tell the version scheme: package.json has no suede.versioning and "${version}" is neither chronver nor semver.`
	);
}

export function bumpSemver(version: string, level: SemverLevel): string {
	const match = SEMVER_PATTERN.exec(version);
	if (!match) throw new Error(`Not a plain semver version: ${version}`);
	const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
	if (level === 'major') return `${major + 1}.0.0`;
	if (level === 'minor') return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}
