#!/usr/bin/env node
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { NEW_USAGE, runNew } from '../new.ts';
import { runVersion } from '../version.ts';

const USAGE = `Usage: pnpm create suede [name]

${NEW_USAGE}

Options:
  -h, --help      Show this message
  -v, --version   Show this CLI's version and the latest create-suede and suede`;

const args = parse(process.argv.slice(2), {
	boolean: ['help', 'version'],
	alias: { h: 'help', v: 'version' }
});

function fail(error: unknown): never {
	prompts.log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

if (args.help) {
	console.log(USAGE);
} else if (args.version) {
	runVersion().catch(fail);
} else {
	runNew(args._[0] === undefined ? undefined : String(args._[0])).catch(fail);
}
