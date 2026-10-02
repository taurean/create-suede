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
5. Sets `name`, `version`, `description`, and `"suede": { "from": "<tag>", "versioning": "<scheme>" }` in `package.json`, the matching root fields in `package-lock.json`, the Worker `name` in `wrangler.jsonc`, and the demo page's heading and tagline.
6. Runs `pnpm install`, connects the project to this machine's deciduous graph server (`deciduous remote setup --local`, setting it up on first use) under a workspace named for the project, then runs `deciduous init`. The template's `.gitignore` and `.gitattributes` are kept as downloaded: the graph lives on the server, not in git.
7. Commits the template files plus what `deciduous init` wrote under `.claude/`, staged by name. The commit message records the suede commit hash.
8. Creates the `chore/suede-kickoff` branch.
9. Creates the GitHub repository and pushes `main`, if you chose one.

Then open Claude Code in the new directory and run `/suede-kickoff`.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Working in a project

Run these from the project's `main/` checkout or from any task worktree.

```bash
suede task feat/login   # new worktree at ../feat-login on branch feat/login, off the latest main
suede done              # remove worktrees whose branches are merged, then fast-forward main
suede release [level]   # commit the version bump on this branch (level: patch|minor|major, semver only)
suede release --tag     # after the merge: tag main's merge commit with its version and push the tag
```

`suede task` fetches `origin`, runs `git worktree add ../<type>-<slug> -b <type>/<slug> origin/main` (local `main` when there's no remote), runs `pnpm install` in the new worktree, and copies its `cd` command to your clipboard.

`suede done` fetches and prunes `origin`, then removes each task worktree whose branch has its own commits and is merged into `origin/main`, deleting the local branch with `git branch -d`. It keeps a worktree with uncommitted changes, the one you're standing in, and any branch that hasn't moved since it was created. Then it fast-forwards `main/` when it's on `main` and clean. Merges are detected by ancestry, so squash-merged branches aren't recognised.

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
