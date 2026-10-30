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

## Adding suede to an existing project

```bash
suede install [name]   # from inside the existing repository
```

Run it from any checkout of a repository that has a `package.json` and an `origin` whose default branch is `main`. It leaves that checkout as it is and builds suede's layout beside it:

1. Clones `origin` into `~/Developer/<name>/main`. The name defaults to the repository's name from the `origin` URL; when that isn't a usable directory name, it asks. It stops if `~/Developer/<name>/main` already exists, unless that's the checkout you ran it from, in which case it skips the clone.
2. Copies the root-level `.env`, `.env.*` and `.dev.vars` files the original checkout ignores into the new `main/`, and lists them: your secrets now live in both places. It stops rather than overwrite one `origin`'s `main` tracks.
3. Creates a `chore/suede-install` worktree beside `main/` off `origin/main`, linking the env files in as `suede task` does.
4. Writes suede's `task`, `review`, `project-plan` and `orient` skills and every agent into `.claude/`, suede's `CLAUDE.md` as `SUEDE_CLAUDE.md`, and `"suede": { "from": "<tag>", "versioning": "<scheme>" }` at the end of `package.json`, inferring the scheme from the version and asking when it can't. A skill or agent the project already had is replaced and listed. It won't write through a symlink the repository tracks.

It doesn't commit, push or open a pull request. Before cloning, it lists uncommitted changes and branches that were never pushed or have commits `origin` lacks, since the clone won't have them, and asks before going on. It refuses a project that already has `suede.from`; use `suede update` there.

For a SvelteKit project that installs with pnpm (`@sveltejs/kit` in `package.json`, and a `pnpm-lock.yaml` or a `packageManager` naming pnpm), it also asks, before cloning, whether to add suede-css. Yes writes the `design` and `writing-css` skills and runs `pnpm add @taurean/suede-css@<suede's range>` in the worktree. It doesn't import it: add `@import '@taurean/suede-css';` to your global stylesheet yourself. Any other project isn't asked, and one line says what it lacks.

Merge what applies from `SUEDE_CLAUDE.md` into your `CLAUDE.md` and delete it: suede's skills read their rules from `CLAUDE.md`. `suede-kickoff` isn't installed, and neither are `design` and `writing-css` when suede-css wasn't added; `suede update` keeps every skill install left out, out.

## Checking the version

```bash
suede --version          # or -v; create-suede --version prints the same
```

Prints this CLI's version, the latest `create-suede` on npm, and the latest suede tag (resolved the same way `suede new` resolves it). When the installed CLI is behind npm, it names the upgrade command for how it was installed: `volta install`, `pnpm add -g`, or `npm install -g`. Inside a suede project it adds the project's `suede.from` and how far it's behind the latest suede tag, two ways: releases behind (every newer tag, each `.N` cut counting as one) and days behind (the gap between the two tags' dates), pointing at `suede update` when there's anything to bring in. The drift comes from the same `git ls-remote` as the latest tag, so it costs no extra call; when `suede.from` isn't a tag on suede, that row says why. If npm or GitHub can't be reached, that line says so and the rest still prints, exiting 0.

`~/Developer/<name>/` is a container: `main/` is the primary checkout, and task worktrees go beside it (`git worktree add ../<type>-<slug> -b <type>/<slug> origin/main`).

## Working in a project

Run these from the project's `main/` checkout or from any task worktree. `suede task`, `suede done` and `suede status` need only git, not `suede.from`: they run in any git repository with task worktrees beside the main checkout, suede project or not, and stop with an error outside a git repository. `suede release` and `suede update` still need a suede project.

```bash
suede task feat/login   # new worktree at ../feat-login on branch feat/login, off the latest main
suede done              # remove worktrees whose branches are merged, then fast-forward main
suede release [level]   # commit the version bump on this branch (level: patch|minor|major, semver only)
suede release --tag     # after the merge: tag main's merge commit with its version and push the tag
suede status            # each task worktree: uncommitted, merged and ready for done, its open PR
suede update            # merge the latest suede's skills and agents into a new worktree, uncommitted
```

`suede task` fetches `origin`, runs `git worktree add ../<type>-<slug> -b <type>/<slug> origin/main` (local `main` when there's no remote), symlinks the main checkout's env files into the new worktree, runs `pnpm install` there, and copies its `cd` command to your clipboard. It installs only with pnpm: when the main checkout has no `pnpm-lock.yaml` and no `packageManager` naming pnpm, it stops before creating anything.

The env files are the root-level `.env`, `.env.*` and `.dev.vars` files in the main checkout that git ignores and doesn't track; suede's `.gitignore` keeps `.env.example` and `.env.test` out of that. Each link is relative (`../main/.env`), so a secret rotated in `main/` reaches every worktree, and editing one in a worktree edits it in `main/`. Nothing git doesn't ignore is linked, so a link can't be committed by accident, and `suede done` removes the links with the worktree.

`suede done` fetches and prunes `origin`, then removes each task worktree whose branch has its own commits and is merged into `origin/main`, deleting the local branch with `git branch -D`, since the merged check against `origin/main` is what decides, not the branch's upstream. If one removal fails, it reports the error, carries on with the rest, and exits non-zero. It keeps a worktree with uncommitted changes, the one you're standing in, and any branch that hasn't moved since it was created. Then it fast-forwards `main/` when it's on `main` and clean. Merges are detected by ancestry, so squash-merged branches aren't recognised.

`suede release` runs on the branch you're about to merge, with a clean tree. It reads the scheme from `suede.versioning` (or infers it from the version for older projects). Chronver uses today's date, adding `.N` when a tag or `main` already used it; semver asks for patch, minor or major unless you pass one. It rewrites only the version fields in `package.json` and `package-lock.json`, commits them as `chore(release): cut <version>`, and doesn't push. It refuses on `main` or when the branch's last commit is already a release commit.

`suede release --tag` fetches `origin`, reads the version from `origin/main`'s `package.json`, creates an annotated tag on that commit, and pushes only the tag. It refuses when the tag already exists.

`suede status` fetches `origin` (without pruning) and lists each task worktree beside the main checkout: its branch and path, whether it has uncommitted changes, and whether it's merged into `origin/main` with commits of its own, the same test `suede done` uses to remove it. Next to each one it shows the open pull request on that branch from `gh pr list`: its number, draft or ready, and its checks, summarised as GitHub shows them (failing, pending, passing, or none). Open pull requests whose branch has no worktree here are listed after. When `gh` isn't installed or signed in, one line says so and the worktrees still print. It changes nothing in the project and says nothing about suede; `suede --version` shows the drift.

`suede update` brings in what changed in suede between `suede.from` and the latest tag, and stops before committing anything so the update gets reviewed like any other change. It downloads both tags, creates a `chore/suede-update-<tag>` worktree beside the main checkout off the latest main (as `suede task` does), and writes into it:

- `.claude/skills/` and `.claude/agents/`, merged three ways per file with `git merge-file`: suede at `suede.from` is the base, suede at the latest tag is one side, the project is the other. Overlapping edits are left as conflict markers, never resolved for you. A file suede added is added. A file suede removed is deleted when the project hadn't edited it, and kept and listed when it had. A skill directory or agent file the project deleted stays deleted, and is listed when suede changed it since.
- New files under `src/lib/components/` that suede added since `suede.from`. Components the project already has are never changed, and ones it deleted stay out.
- `suede.from`, set to the latest tag, and `@taurean/suede-css`, set to suede's range when the project's is older (majors included), followed by `pnpm install`. Both are edited as text, so the diff is those lines.

It prints the conflicts, everything it added, removed or left out, the changelog, and a GitHub compare link when suede's `CLAUDE.md` changed. It never touches `CLAUDE.md`: kickoff rewrites it in every project, so port what applies by hand. It doesn't commit, push or open a pull request; resolve the conflicts, review, and commit on the branch. At the latest tag it says so and creates nothing. It stops with an error when the update's branch or worktree already exists.

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
