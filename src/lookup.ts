/** A read from an outside source that reports its failure instead of throwing it. */
export type Lookup<T> = { ok: true; value: T } | { ok: false; reason: string };

/** One line of cause. run() puts stderr after the invocation line, so the last line carries it. */
function lastLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const lines = message
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.at(-1) ?? message;
}

export async function lookup<T>(source: string, read: () => Promise<T>): Promise<Lookup<T>> {
	try {
		return { ok: true, value: await read() };
	} catch (error) {
		return { ok: false, reason: `${source}: ${lastLine(error)}` };
	}
}
