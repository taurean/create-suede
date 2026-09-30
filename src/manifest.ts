import type { Versioning } from './versioning.ts';

export interface ProjectFields {
	name: string;
	version: string;
	versioning: Versioning;
	description: string;
	suedeTag: string;
}

type Manifest = Record<string, unknown>;

/** Applies the project's identity to suede's package.json, keeping field order. */
export function applyToPackageJson(manifest: Manifest, fields: ProjectFields): Manifest {
	const { suede: _previousLineage, ...rest } = manifest;
	return {
		...rest,
		name: fields.name,
		version: fields.version,
		description: fields.description,
		suede: { from: fields.suedeTag, versioning: fields.versioning }
	};
}

/** Keeps package-lock.json's root entries in step with package.json. */
export function applyToPackageLock(lock: Manifest, fields: ProjectFields): Manifest {
	const packages = lock.packages as Record<string, Manifest> | undefined;
	const root = packages?.[''];
	return {
		...lock,
		name: fields.name,
		version: fields.version,
		...(packages && root
			? { packages: { ...packages, '': { ...root, name: fields.name, version: fields.version } } }
			: {})
	};
}

export function detectIndent(json: string): string {
	return /^[ \t]+(?=")/m.exec(json)?.[0] ?? '\t';
}

const WRANGLER_NAME_PATTERN = /("name"\s*:\s*)"[^"]*"/;

/**
 * Sets the Worker name in wrangler.jsonc. The file is JSONC (comments allowed),
 * so it's edited as text: the first `"name"` field is the top-level Worker name.
 */
export function applyToWranglerConfig(source: string, name: string): string {
	return source.replace(WRANGLER_NAME_PATTERN, `$1${JSON.stringify(name)}`);
}
