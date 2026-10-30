import { compareSemver, type Versioning } from './versioning.ts';

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

/**
 * Appends `"suede": { "from", "versioning" }` as package.json's last field, as
 * text, so the diff is the added lines. Throws when the manifest already has one.
 */
export function addSuedeField(source: string, from: string, versioning: Versioning): string {
	if ((JSON.parse(source) as { suede?: unknown }).suede !== undefined) {
		throw new Error('package.json already has a "suede" field.');
	}
	const indent = detectIndent(source);
	const close = source.lastIndexOf('}');
	const body = source.slice(0, close).trimEnd();
	const field = JSON.stringify({ from, versioning }, null, indent).replaceAll('\n', `\n${indent}`);
	const separator = body.endsWith('{') ? '' : ',';
	return `${body}${separator}\n${indent}"suede": ${field}\n${source.slice(close)}`;
}

export const SUEDE_CSS = '@taurean/suede-css';

interface Dependencies {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export function suedeCssRange(source: string): string | undefined {
	const manifest = JSON.parse(source) as Dependencies;
	return manifest.dependencies?.[SUEDE_CSS] ?? manifest.devDependencies?.[SUEDE_CSS];
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SuedeCssBump {
	source: string;
	from: string;
	to: string;
}

/**
 * Moves the project's suede-css range up to the one in suede's package.json, as
 * text, majors included: suede's skills are written against that version. Returns
 * undefined when the project doesn't depend on suede-css, suede doesn't, or the
 * project is already at or past suede's version.
 */
export function bumpSuedeCss(projectSource: string, suedeSource: string): SuedeCssBump | undefined {
	const [ours, theirs] = [suedeCssRange(projectSource), suedeCssRange(suedeSource)];
	if (!ours || !theirs) return undefined;
	const difference = compareSemver(ours.replace(/^[\^~]/, ''), theirs.replace(/^[\^~]/, ''));
	if (difference === undefined) {
		throw new Error(
			`Can't compare ${SUEDE_CSS} "${ours}" (project) with "${theirs}" (suede): expected ^x.y.z, ~x.y.z or x.y.z.`
		);
	}
	if (difference >= 0) return undefined;

	const field = new RegExp(`("${escapeRegExp(SUEDE_CSS)}"\\s*:\\s*)"${escapeRegExp(ours)}"`, 'g');
	const matches = projectSource.match(field)?.length ?? 0;
	if (matches !== 1) {
		throw new Error(`Expected one "${SUEDE_CSS}": "${ours}" in package.json, found ${matches}.`);
	}
	return {
		source: projectSource.replace(field, `$1${JSON.stringify(theirs)}`),
		from: ours,
		to: theirs
	};
}
