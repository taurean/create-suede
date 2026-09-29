export interface ProjectFields {
	name: string;
	version: string;
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
		suede: { from: fields.suedeTag }
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
