/**
 * The graph server URL in `.deciduous/config.toml`, as `deciduous remote setup`
 * writes it: a `url = "..."` line under `[remote]`.
 */
export function remoteUrl(configToml: string): string {
	const section = /^\[remote\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(configToml)?.[1];
	const url = section && /^url\s*=\s*"([^"]+)"/m.exec(section)?.[1];
	if (!url) {
		throw new Error(
			'.deciduous/config.toml has no [remote] url after `deciduous remote setup --local`.'
		);
	}
	return url;
}
