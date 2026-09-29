# create-suede

Start a new project from [suede](https://github.com/taurean/suede).

```bash
pnpm create suede <name>
```

The name argument is optional; without it, the CLI asks. It then asks for a one-line purpose and the first version (chronver, defaulting to today).

## What it does

1. Checks that `git`, `node`, `pnpm`, and `deciduous` are installed. It stops before asking anything if one is missing.
2. Resolves the latest suede chronver tag with `git ls-remote`, without cloning.
3. Downloads that tag's tarball into `~/Developer/<name>/main`. The tarball holds only suede's tracked files, so there is no `.git` history, `node_modules`, or decision graph to clean up.
4. Runs `git init` on `main`.
5. Sets `name`, `version`, `description`, and `"suede": { "from": "<tag>" }` in `package.json`, and the matching root fields in `package-lock.json`.
6. Runs `pnpm install` and `deciduous init`.
7. Commits the template files plus what `deciduous init` wrote under `.claude/`, staged by name. The commit message records the suede commit hash.
8. Creates the `chore/suede-kickoff` branch.
9. If `gh` is installed, offers to create a GitHub repository and push `main`.

Then open Claude Code in the new directory and run `/suede-kickoff`.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Development

```bash
pnpm install
pnpm check   # tsc
pnpm lint    # prettier
pnpm test    # vitest
pnpm build   # tsdown -> dist/index.mjs
node dist/index.mjs --help
```

Releases use semver. `pnpm publish` builds first via `prepublishOnly`.
