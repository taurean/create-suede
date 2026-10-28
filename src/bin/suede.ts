#!/usr/bin/env node
import { parse } from '@bomb.sh/args';
import * as prompts from '@clack/prompts';
import { DONE_USAGE, runDone } from '../done.ts';
import { NEW_USAGE, runNew } from '../new.ts';
import { RELEASE_USAGE, runRelease, runReleaseTag } from '../release.ts';
import { runStatus, STATUS_USAGE } from '../status.ts';
import { runTask, TASK_USAGE } from '../task.ts';
import { runUpdate, UPDATE_USAGE } from '../update.ts';
import { runVersion } from '../version.ts';

const USAGE = `Usage: suede <command>

Commands:
  new [name]              ${NEW_USAGE}
  task <type>/<slug>      ${TASK_USAGE}
  done                    ${DONE_USAGE}
  release [level] [--tag] ${RELEASE_USAGE}
  status                  ${STATUS_USAGE}
  update                  ${UPDATE_USAGE}

Options:
  -h, --help      Show this message
  -v, --version   Show this CLI's version, the latest create-suede and suede, and drift`;

const args = parse(process.argv.slice(2), {
	boolean: ['help', 'tag', 'version'],
	alias: { h: 'help', v: 'version' }
});

const COMMANDS: Record<string, (rest: string[]) => Promise<void>> = {
	new: (rest) => runNew(rest[0]),
	task: (rest) => runTask(rest[0]),
	done: () => runDone(),
	release: (rest) => (args.tag ? runReleaseTag() : runRelease(rest[0])),
	status: () => runStatus(),
	update: () => runUpdate()
};

const [command, ...rest] = args._.map(String);
const handler = command === undefined ? undefined : COMMANDS[command];

function fail(error: unknown): never {
	prompts.log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

if (args.help) {
	console.log(USAGE);
} else if (args.version) {
	runVersion().catch(fail);
} else if (command === undefined) {
	console.log(USAGE);
} else if (!handler) {
	console.error(`Unknown command: ${command}\n\n${USAGE}`);
	process.exit(1);
} else {
	handler(rest).catch(fail);
}
