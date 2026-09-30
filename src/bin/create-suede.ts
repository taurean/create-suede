#!/usr/bin/env node
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { NEW_USAGE, runNew } from '../new.ts';

const USAGE = `Usage: pnpm create suede [name]

${NEW_USAGE}

Options:
  -h, --help   Show this message`;

const args = parse(process.argv.slice(2), { boolean: ['help'], alias: { h: 'help' } });

if (args.help) {
	console.log(USAGE);
} else {
	runNew(args._[0] === undefined ? undefined : String(args._[0])).catch((error: unknown) => {
		prompts.log.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
