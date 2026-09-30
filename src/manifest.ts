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

const DEMO_HEADING = '<h1>suede</h1>';
const DEMO_TAGLINE = '<p>a template repo.</p>';

/** Escapes text for Svelte markup, where `{` and `}` open expressions. */
function escapeSvelteText(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('{', '&#123;')
		.replaceAll('}', '&#125;');
}

/**
 * Puts the project's name and purpose on suede's demo page. Only the template's
 * exact placeholder lines are replaced; a page that no longer has them is left as is.
 */
export function applyToDemoPage(source: string, name: string, description: string): string {
	return source
		.replace(DEMO_HEADING, `<h1>${escapeSvelteText(name)}</h1>`)
		.replace(DEMO_TAGLINE, `<p>${escapeSvelteText(description)}</p>`);
}

/**
 * Replaces the first `count` `"version": "<from>"` fields as text, leaving the rest
 * of the file byte-for-byte. package.json has one; package-lock.json has two at the
 * top (the root and its `packages[""]` entry), ahead of any dependency.
 */
export function replaceVersionText(
	source: string,
	from: string,
	to: string,
	count: number
): string {
	const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const field = new RegExp(`("version"\\s*:\\s*)"${escaped}"`, 'g');
	let replaced = 0;
	return source.replace(field, (match, key: string) =>
		replaced++ < count ? `${key}${JSON.stringify(to)}` : match
	);
}
