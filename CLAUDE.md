# CLAUDE.md — create-suede

## What this is

create-suede is the command-line tool for
[suede](https://github.com/taurean/suede), a project template. It ships two
binaries:

- `create-suede`, run as `pnpm create suede`, scaffolds a new project from
  suede's latest tag.
- `suede` runs the commands inside a project: `new`, `install`, `task`, `done`,
  `release`, `status`, `update`.

Other projects depend on this tool, and the README is the user-facing contract
for every command. A change in behaviour is a change to that contract: update
the README with it.

## Stack

Node 22 or later, TypeScript, pnpm. Runtime dependencies are `@bomb.sh/args`,
`@clack/prompts`, and `giget`.

| Command      | What it does                                     |
| ------------ | ------------------------------------------------ |
| `pnpm lint`  | Prettier check over the whole repo, Markdown too |
| `pnpm check` | `tsc` type check                                 |
| `pnpm test`  | Vitest, single run                               |
| `pnpm build` | tsdown bundles `src/bin/*.ts` to `dist/*.mjs`    |

CI runs these four on every pull request and on `main`. `pnpm format` fixes
lint failures.

## Layout

- `src/bin/create-suede.ts` and `src/bin/suede.ts` are the two entry points.
  Everything else in `src/` is a flat set of modules, with tests beside them as
  `*.test.ts`.
- `dist/` is build output and the only thing published (`package.json#files`).
- `package.json#suede` records which suede tag this repo's own setup came from
  (`from`) and its version scheme (`versioning`). The `suede` commands read
  this same field in the projects they manage.
- Never run `suede update` in this repository. Because `package.json#suede`
  marks it as a suede project, `suede update` would merge suede's
  `.claude/skills/` and `.claude/agents/` back in (`MERGE_AREAS` in
  `src/update.ts`).
- The working directory and command-line arguments are read in each command's
  `run*` entry function and passed down, e.g. `findProjectRoot(process.cwd())`
  in `src/release.ts`. Helpers take them as arguments. Helpers may read the
  platform, the home directory, and what the terminal supports themselves.

## Versions and publishing

- Versions follow [semver](https://semver.org), because other projects depend
  on this tool and a version has to say whether an upgrade is safe. The version
  lives in `package.json#version`.
- The version changes when a release is cut, not on every branch.
  `suede release [patch|minor|major]` makes the bump commit, and
  `suede release --tag` tags the head of `origin/main` (the merge commit) with
  the bare version string, annotated, and pushes the tag to `origin` when there
  is one.
- Publishing to npm is done by the human, never by an agent. It cannot be
  undone: a published version number can never be used again.
- Merges to `main` are done by the human.

## Verifying a change

Passing tests are not enough. For a change to a command:

1. Run `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm build`.
2. Run the changed command from `dist/` against a scratch directory, and see it
   do the thing.

A verification run never points at a real project or at a real
`~/Developer/<name>` path unless the human says so. The commands create
worktrees, branches, and files, and some push to remotes.
