# CLAUDE.md — create-suede

Project rulebook. Read at task start.

## Overview

create-suede is the command-line tool for
[suede](https://github.com/taurean/suede). It ships two binaries: `create-suede`
(run as `pnpm create suede`) scaffolds a new project from suede's latest tag,
and `suede` runs the in-project commands — `new`, `install`, `task`, `done`,
`release`, `status`, `update`. The README is the user-facing contract for every
command.

This repo is itself a suede fork. It inherits suede's process layer — git
workflow, pipeline, releases — and drops the web layer, since a
CLI has no SvelteKit, Cloudflare, Storybook, or design system. Lineage is in
`package.json#suede`.

## Stack

Node ≥ 22 · TypeScript · tsdown (bundles `src/bin/*.ts` to `dist/*.mjs`) ·
Vitest · Prettier · pnpm. Runtime dependencies: `@bomb.sh/args`,
`@clack/prompts`, `giget`.

## Git workflow

- Always branch from `main`, and always from the **latest** `main`. The
  branch-from-`main` rule is only meaningful if the base commit is current —
  otherwise the branch silently forks from a superseded commit and the PR base
  vanishes the same way an in-flight branch does. Before creating the branch,
  fetch `origin`, base on `origin/main`, and verify the tree is clean.
- **Never branch off an in-flight branch.** The only base for a new branch is
  `main`. While a PR is open, new work either becomes a follow-up commit on the
  _same_ branch or waits. A branch-of-branch creates a PR whose base vanishes the
  moment the first PR merges.
- All tasks are reviewed in a pull request.
- **The agent may push branches and apply tags, but never merges to `main` and
  never pushes directly to `main`.** The human reviews and merges. Pushing a
  release branch and tagging the human's merge commit are both agent-OK; the
  merge itself is human-only.
- The human is the commit author for all commits. Agent-made commits add a
  `Co-authored-by:` trailer crediting the harness, so assistance is visible
  without tying the repo to one tool.

### Branch and commit naming

Branch names are `<type>/<slug>`, where `<slug>` is a short kebab-case
description. Commit messages are `<type>(<scope>): <subject>`, scope optional,
subject present-tense imperative ("add X", not "added X"). `chore(release):` is
reserved for the version-bump commit — see **Releases**.

**Canonical type list** (conventional-commits 1.0.0):

`feat` (new user-visible feature) · `fix` (bug fix for user-visible behaviour) ·
`chore` (maintenance, dependency bumps, tooling, version bumps) · `docs`
(documentation only) · `refactor` (neither fixes a bug nor adds a feature) ·
`test` (test additions or corrections) · `build` (build system or external
dependency) · `ci` (CI configuration) · `perf` (performance) · `style`
(formatting, no logic change).

The [spec](https://www.conventionalcommits.org/en/v1.0.0/) is upstream; the list
is restated here so the agent doesn't fetch it on first use.

## Layout

- `CLAUDE.md` — this file
- `CONTEXT.md` — non-obvious constraints and gotchas unique to this project
- `SYSTEMS_MAP.md` — where things live and what changes together. Its Layout
  tree is the canonical repo map; this file doesn't duplicate it.
- `.claude/skills/` — in-repo skills. Directories are kebab-case, each with a
  `SKILL.md` and optional companion files (`task/brief.md`, `task/testing.md`).
- `.claude/agents/` — in-repo subagents dispatched by `review` and `task`, one
  `<name>.md` each.

`CONTEXT.md`, `SYSTEMS_MAP.md`, and `task/testing.md` don't exist yet. Skills
that read them skip any that are missing.

Durable records of work: the project's tracker and merged PR history. There is
no per-task markdown note.

## Constant process pipeline

The pipeline is suede's, unchanged. Don't invent a new one; if a stage doesn't
fit a task, compress it but keep the shape.

| Stage                                                             | Home                  | When                                                                                                     |
| ----------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. **Concept** — in conversation, an issue, or a bug report       | —                     | Always; the input to the pipeline                                                                        |
| 2. **Align** on goal, boundary, reversibility, and review posture | `/task` step 1        | Every task. Short back-and-forth per `/poke-holes`                                                       |
| 3. **Cut plan**                                                   | `/project-plan`       | Only when the work cannot land as one PR. One plan issue with a cut checklist, never an issue per cut    |
| 4. **Build**                                                      | `/task`               | Every task: prep (worktree, systems map, brief, draft PR), then vertical slices with story-derived tests |
| 5. **Verify**                                                     | `/task` step 4        | Every task, before review. The CLI observed doing the thing, not a green suite                           |
| 6. **Review**                                                     | `/review`             | Four-axis review — Standards, Spec, Discipline, Legibility — in parallel subagents, before merge         |
| 7. **Release**                                                    | This file, "Releases" | Version bump as the final commit on the release branch; human tags the merge commit on `main`            |

**Always-on supporting layer** — not stages, they run throughout:

- **Engineering discipline** — the standing rules for fallbacks, slice hygiene,
  reversibility, dead code, failure messages, and when to stop and ask. A
  personal skill (see "Working style"), loaded automatically. Cited by rule ID
  in reviews.
- **Git workflow** — this file's section above.

Stage 3 fires only for multi-PR work.

**Tracker.** Stages 3 and 6 assume **GitHub Issues** — where `/project-plan`
publishes the plan issue and `/review` reads specs. When no tracker is
configured, the plan lives in the first cut's PR description and review falls
back to the PR body's brief.

## Legibility

Most code here is generated, and it's read by people who weren't there when it
was written. Write for the time it takes someone unoriented to understand one
unit — a function or command — and to debug it. People hold about four
half-understood ideas at once; every layer that makes them hold one more is a
cost.

This covers hand-written code: source and tests. Not generated files, `dist/`,
lockfiles, config, or markdown.

### What reading a unit costs

- **Read cost** — the lines a reader actually reads to understand the unit: the
  unit itself plus every hop they have to follow. Shorter is better, until
  shortness makes code confusing, brittle, or opaque.
  - When **understanding**, a reader skips hops whose name and signature say
    what they do.
  - When **debugging**, names stop helping: the question is whether the code
    does what its name says. The reader follows every hop on the failing path,
    except ones they can check at the boundary.
- **Linearity** — how often a top-to-bottom read has to leave the unit. Code
  that needs a reading order explained isn't linear.
- **Name sufficiency** — whether a hop's name and signature predict what it
  does. A hop that does is free to a reader who's understanding, not debugging.
- **Hop depth** — how many hops a reader has to follow before reaching ground
  they already know: the language, Node, or a well-known library. A
  name-sufficient hop isn't followed, so it doesn't count.
- **Concepts held open** — the most half-understood things a reader has to keep
  in mind at once.
- **Pass-through layer** — a layer that, inlined, would cost the reader nothing:
  a wrapper that forwards its arguments, a single-use helper whose name says
  less than its body, an options object with one caller.
- **Explicit boundary** — an extracted unit's inputs are its arguments, and its
  effects are its return value or named by it (`writeManifest`, not `process`).
  A hidden input is anything read from outside the arguments, except
  module-level `const` and imports from Node or the standard library.
  `process.env`, `process.cwd()`, `process.argv`, and module-level mutable
  state count as hidden. A unit with an explicit boundary can be checked from
  the call site — what went in, what came out — without stepping into it.

### Writing to it

- Extract only when the name lets a reader skip the body. Otherwise, inline.
- Keep inputs in the arguments. Read process state (`process.env`,
  `process.cwd()`, `process.argv`) in the command's entry point, and pass the
  value down.
- Extend a pattern the codebase already has before introducing a new one.
- `const` by default; `let` only for a binding that's reassigned.

### What blocks merge

`/review`'s legibility reviewer blocks on:

- hop depth over 2;
- any pass-through layer;
- an extraction whose name doesn't predict what it does;
- an extraction with hidden inputs or unnamed effects;
- more than **3** new ideas in one PR without a reason in the PR body. A new
  idea is a new exported name or dependency, or the first instance of a pattern
  the codebase didn't have. A new module isn't counted apart from its exports:
  one file exporting one function is one idea.

Read cost, linearity, and concepts held open are advisory: reported where
they're high, as findings, never as numbers. A diff over about 400 changed lines
of hand-written code is noted, never blocked.

## Working style

The pipeline table above says which skill applies at which stage. Load the
relevant one when the stage applies; don't load for the sake of loading.

In-repo skills (`.claude/skills/`), copied from suede:

- `task` — the task spine, user-invoked. `brief.md` owns the brief format;
  `testing.md` owns test quality and the prune pass.
- `project-plan` — cut plan for work too big for one PR. User-invoked.
- `review` — four-axis review, dispatching to the in-repo reviewer agents.
- `orient` — render the current work unit as a visual page in `tmp/`.
  User-invoked; never run it on your own. Offer it once, in one line, when the
  brief's reversibility line names something hard to undo, or when the human
  shows they've lost the thread: asking what something is for or why it's
  there, or returning to a branch after time away.

Suede's `writing-css`, `design`, and `suede-kickoff` skills are left out: the
first two govern a UI this project doesn't have, and kickoff only runs in a
project the CLI just created.

In-repo agents (`.claude/agents/`): `standards-reviewer`, `spec-reviewer`,
`discipline-reviewer`, and `legibility-reviewer` (dispatched by `review`), and
`story-test-writer` (dispatched by `task`).

Personal skills live in `~/.claude/skills/` and are not enumerated here.
`engineering-discipline`, `poke-holes`, and `systems-map` are the ones this
pipeline depends on. Install each by copying its folder from
[selvage](https://github.com/taurean/selvage/tree/main/dot_claude/exact_skills)
into `~/.claude/skills/<name>/`. They stay personal rather than in-repo, since a
personal skill shadows a project skill of the same name and an in-repo copy
would never run for anyone who has the personal one.

## Task flow

`/task` owns the sequence end to end — alignment, prep, build, verify, review,
closeout. Alongside it, every commit carries the co-authorship trailer.
Verification and release mechanics have their own sections below. The merge to
`main` is human-only.

## Agent-authored output

Everything an agent writes on GitHub — PR bodies, `/review` reports, closeout
comments — has two readers: the human deciding what to do, and the next agent
picking up the work. They need different things, so each gets its own part.

**The human summary comes first**, at most about ten lines. Lead with the
verdict: whether anything blocks, or what the human needs to decide. Then one
line per item they act on:

```
- What's wrong, in plain words. Fix: what to do. In `file.ts:42`.
```

The problem comes first, because it's what the reader needs to decide whether
to keep reading. Location comes last: a bare file name when it's unambiguous, a
path when it isn't, and every file named on its own — never a `{a,b}` set.
Labels a reader can skip, like a category or severity, go after the location in
parentheses.

Nothing goes in the summary that the human doesn't act on. If it runs past ten
lines and not every line is an action, detail has leaked in; move it down.

**Everything for agents goes below, collapsed:**

```
<details>
<summary>For agents</summary>

The brief, full reports, reasoning, evidence.

</details>
```

The blank lines inside the block are required; GitHub doesn't render markdown
without them.

| Surface                  | Summary                                                                     | Collapsed                  |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------- |
| PR body                  | What changed, why, where the human's judgement is needed, verification line | The brief                  |
| `/review` report         | Verdict, then one line per blocking finding, synthesized across reviewers   | Each reviewer's raw report |
| `/task` closeout comment | Merge verdict, where to focus, one line per open question                   | Reasoning behind each      |

**Agent comments start with a marker** on their first line —
`<!-- suede:review -->` or `<!-- suede:closeout -->`. `/review` reads PR comments
as spec and skips any whose first line is a `suede:` marker, so a past review
never gets read as a requirement.

## Releases

create-suede uses [semver](https://semver.org): it's a tool other projects
depend on, so a version has to say whether an upgrade is safe. Version lives in
`package.json#version`, and `package.json#suede.versioning` records the scheme.

Mechanics are suede's: every release branch ships as its own version bump; the
bump is the final commit before merge; the merge commit on `main` is tagged with
the bare version string, annotated; the changelog is `git log <prev>..<new>`,
with no `CHANGELOG.md`.

**No versionless merges.** Every branch ready to merge to `main` ships as its
own version.

### Cutting a release

1. Final commit is `chore(release): cut <version>`, touching only the version
   fields. `suede release [patch|minor|major]` makes this commit.
2. After the human merges, tag the merge commit on `main` with the bare version
   string, annotated, and push the tag. `suede release --tag` does both.
3. `git log <prev>..<new>` is the changelog.

Publishing to npm (`pnpm publish`, which builds first via `prepublishOnly`) is
human-only. It's irreversible in the ways that matter: a published version can't
be reused.

### Upstream lineage

`package.json#suede.from` is the suede tag this repo's process layer was copied
from. When suede's `CLAUDE.md`, `.claude/skills/{task,review,project-plan}`, or
`.claude/agents/` change, pull the change here and bump `from` in the same
commit.

## Guardrails

Always:

- Run verification before claiming done.
- Capture verification results in the PR description.

Never:

- Skip the PR description.
- Commit secrets.
- Publish to npm.

## Verification before completion

- `pnpm lint` — pass
- `pnpm check` — pass
- `pnpm test` — pass
- `pnpm build`, then run the changed command from `dist/` against a scratch
  directory — the CLI observed doing the thing. A green suite is necessary and
  not sufficient; tests written against code written in the same context share a
  common ancestor. Never point a verification run at a real project or at the
  real `~/Developer/<name>` path without the human's say-so.

Claim done with evidence: command plus result.
