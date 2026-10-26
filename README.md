# create-suede

Start a new project from [suede](https://github.com/taurean/suede).

```bash
pnpm create suede <name>
# or, installed globally (npm i -g create-suede):
suede new <name>
```

The name argument is optional; without it, the CLI asks. It asks every question before doing any work — a one-line purpose, the versioning scheme (chronver starts at today's date, semver at `0.1.0`), and, if `gh` is installed, whether to create a private or public GitHub repository — then runs the rest unattended. When it finishes, the `cd` command for the new project is on your clipboard.

## What it does

1. Checks that `git`, `node`, and `pnpm` are installed. It stops before asking anything if one is missing.
2. Resolves the latest suede chronver tag with `git ls-remote`, without cloning.
3. Downloads that tag's tarball into `~/Developer/<name>/main`. The tarball holds only suede's tracked files, so there is no `.git` history or `node_modules` to clean up.
4. Runs `git init` on `main`.
5. Sets `name`, `version`, `description`, and `"suede": { "from": "<tag>", "versioning": "<scheme>" }` in `package.json`, the matching root fields in `package-lock.json`, the Worker `name` in `wrangler.jsonc`, and the demo page's heading and tagline.
6. Runs `pnpm install`.
7. Commits the template files, staged by name. The commit message records the suede commit hash.
8. Creates the `chore/suede-kickoff` branch.
9. Creates the GitHub repository and pushes `main`, if you chose one.

Then open Claude Code in the new directory and run `/suede-kickoff`.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Checking the version

```bash
suede --version          # or -v; create-suede --version prints the same
```

Prints this CLI's version, the latest `create-suede` on npm, and the latest suede tag (resolved the same way `suede new` resolves it). When the installed CLI is behind npm, it names the upgrade command for how it was installed: `volta install`, `pnpm add -g`, or `npm install -g`. Inside a suede project it adds the project's `suede.from`; `suede status` reports the drift. If npm or GitHub can't be reached, that line says so and the rest still prints, exiting 0.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Working in a project

Run these from the project's `main/` checkout or from any task worktree. `suede task` and `suede done` need only git, not `suede.from`: they run in any git repository with task worktrees beside the main checkout, suede project or not, and stop with an error outside a git repository. `suede release` still needs a suede project.

```bash
suede task feat/login   # new worktree at ../feat-login on branch feat/login, off the latest main
suede done              # remove worktrees whose branches are merged, then fast-forward main
suede release [level]   # commit the version bump on this branch (level: patch|minor|major, semver only)
suede release --tag     # after the merge: tag main's merge commit with its version and push the tag
```

`suede task` fetches `origin`, runs `git worktree add ../<type>-<slug> -b <type>/<slug> origin/main` (local `main` when there's no remote), runs `pnpm install` in the new worktree, and copies its `cd` command to your clipboard. It installs only with pnpm: when the main checkout has no `pnpm-lock.yaml` and no `packageManager` naming pnpm, it stops before creating anything.

`suede done` fetches and prunes `origin`, then removes each task worktree whose branch has its own commits and is merged into `origin/main`, deleting the local branch with `git branch -D`, since the merged check against `origin/main` is what decides, not the branch's upstream. If one removal fails, it reports the error, carries on with the rest, and exits non-zero. It keeps a worktree with uncommitted changes, the one you're standing in, and any branch that hasn't moved since it was created. Then it fast-forwards `main/` when it's on `main` and clean. Merges are detected by ancestry, so squash-merged branches aren't recognised.

`suede release` runs on the branch you're about to merge, with a clean tree. It reads the scheme from `suede.versioning` (or infers it from the version for older projects). Chronver uses today's date, adding `.N` when a tag or `main` already used it; semver asks for patch, minor or major unless you pass one. It rewrites only the version fields in `package.json` and `package-lock.json`, commits them as `chore(release): cut <version>`, and doesn't push. It refuses on `main` or when the branch's last commit is already a release commit.

`suede release --tag` fetches `origin`, reads the version from `origin/main`'s `package.json`, creates an annotated tag on that commit, and pushes only the tag. It refuses when the tag already exists.

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
