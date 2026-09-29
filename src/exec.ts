import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function run(command: string, args: string[], cwd?: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
		return stdout;
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr?.trim();
		const invocation = [command, ...args].join(' ');
		throw new Error(`\`${invocation}\` failed${stderr ? `:\n${stderr}` : '.'}`, { cause: error });
	}
}

export async function isInstalled(command: string): Promise<boolean> {
	try {
		await execFileAsync('sh', ['-c', `command -v ${command}`]);
		return true;
	} catch {
		return false;
	}
}
