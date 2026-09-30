import { spawn } from 'node:child_process';

/** Clipboard commands by platform, tried in order. */
const CLIPBOARD_COMMANDS: Record<string, [string, ...string[]][]> = {
	darwin: [['pbcopy']],
	win32: [['clip']],
	linux: [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']]
};

function pipeTo([command, ...args]: [string, ...string[]], text: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
		child.on('error', () => resolve(false));
		child.on('close', (code) => resolve(code === 0));
		child.stdin.end(text);
	});
}

/** Copies text to the system clipboard. Returns false when no clipboard command works. */
export async function copyToClipboard(text: string): Promise<boolean> {
	for (const command of CLIPBOARD_COMMANDS[process.platform] ?? []) {
		if (await pipeTo(command, text)) return true;
	}
	return false;
}
