#!/usr/bin/env node
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { NEW_USAGE, runNew } from '../new.ts';

const USAGE = `Usage: suede <command>

Commands:
  new [name]   ${NEW_USAGE}

Options:
  -h, --help   Show this message`;

const args = parse(process.argv.slice(2), { boolean: ['help'], alias: { h: 'help' } });
const [command, ...rest] = args._.map(String);

if (args.help || command === undefined) {
	console.log(USAGE);
} else if (command === 'new') {
	runNew(rest[0]).catch((error: unknown) => {
		prompts.log.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
} else {
	console.error(`Unknown command: ${command}\n\n${USAGE}`);
	process.exit(1);
}
