import { todayChronver } from './chronver.ts';

export type Versioning = 'chronver' | 'semver';

export function defaultVersion(versioning: Versioning, date = new Date()): string {
	return versioning === 'chronver' ? todayChronver(date) : '0.1.0';
}
