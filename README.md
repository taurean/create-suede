# create-suede

Start a new project from [suede](https://github.com/taurean/suede).

```bash
pnpm create suede <name>
# or, installed globally (npm i -g create-suede):
suede new <name>
```

The name argument is optional; without it, the CLI asks. It asks every question before doing any work — a one-line purpose, the versioning scheme (chronver starts at today's date, semver at `0.1.0`), and, if `gh` is installed, whether to create a private or public GitHub repository — then runs the rest unattended. When it finishes, the `cd` command for the new project is on your clipboard.

## What it does

1. Checks that `git`, `node`, `pnpm`, and `deciduous` are installed. It stops before asking anything if one is missing.
2. Resolves the latest suede chronver tag with `git ls-remote`, without cloning.
3. Downloads that tag's tarball into `~/Developer/<name>/main`. The tarball holds only suede's tracked files, so there is no `.git` history, `node_modules`, or decision graph to clean up.
4. Runs `git init` on `main`.
5. Sets `name`, `version`, `description`, and `"suede": { "from": "<tag>", "versioning": "<scheme>" }` in `package.json`, the matching root fields in `package-lock.json`, and the Worker `name` in `wrangler.jsonc`.
6. Runs `pnpm install` and `deciduous init`.
7. Commits the template files plus what `deciduous init` wrote under `.claude/`, staged by name. The commit message records the suede commit hash.
8. Creates the `chore/suede-kickoff` branch.
9. Creates the GitHub repository and pushes `main`, if you chose one.

Then open Claude Code in the new directory and run `/suede-kickoff`.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Development

```bash
pnpm install
pnpm check   # tsc
pnpm lint    # prettier
pnpm test    # vitest
pnpm build   # tsdown -> dist/index.mjs
node dist/suede.mjs --help
```

Releases use semver. `pnpm publish` builds first via `prepublishOnly`.
