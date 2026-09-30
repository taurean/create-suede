#!/usr/bin/env node
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { DONE_USAGE, runDone } from '../done.ts';
import { NEW_USAGE, runNew } from '../new.ts';
import { runTask, TASK_USAGE } from '../task.ts';

const USAGE = `Usage: suede <command>

Commands:
  new [name]              ${NEW_USAGE}
  task <type>/<slug>      ${TASK_USAGE}
  done                    ${DONE_USAGE}

Options:
  -h, --help   Show this message`;

const COMMANDS: Record<string, (rest: string[]) => Promise<void>> = {
	new: (rest) => runNew(rest[0]),
	task: (rest) => runTask(rest[0]),
	done: () => runDone()
};

const args = parse(process.argv.slice(2), { boolean: ['help'], alias: { h: 'help' } });
const [command, ...rest] = args._.map(String);
const handler = command === undefined ? undefined : COMMANDS[command];

if (args.help || command === undefined) {
	console.log(USAGE);
} else if (!handler) {
	console.error(`Unknown command: ${command}\n\n${USAGE}`);
	process.exit(1);
} else {
	handler(rest).catch((error: unknown) => {
		prompts.log.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
