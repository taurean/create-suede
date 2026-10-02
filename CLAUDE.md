# CLAUDE.md — create-suede

Project rulebook. Read at task start.

## Overview

create-suede is the command-line tool for
[suede](https://github.com/taurean/suede). It ships two binaries: `create-suede`
(run as `pnpm create suede`) scaffolds a new project from suede's latest tag,
and `suede` runs the in-project commands — `new`, `task`, `done`, `release`. The
README is the user-facing contract for every command.

This repo is itself a suede fork. It inherits suede's process layer — git
workflow, pipeline, releases, decision graph — and drops the web layer, since a
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

- `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`,
  `.claude/agents.toml`, and the Decision Graph Workflow section at the end of
  this file — generated and maintained by `deciduous update`. Don't hand-edit.

Durable records of work: the `deciduous` decision graph on the graph server
(see "Decision graph"), the project's tracker, and merged PR history. There is no per-task markdown note.

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
| 6. **Review**                                                     | `/review`             | Three-axis review — Standards, Spec, Discipline — in parallel subagents, before merge                    |
| 7. **Release**                                                    | This file, "Releases" | Version bump as the final commit on the release branch; human tags the merge commit on `main`            |

**Always-on supporting layer** — not stages, they run throughout:

- **Engineering discipline** — the standing rules for fallbacks, slice hygiene,
  reversibility, dead code, failure messages, and when to stop and ask. A
  personal skill (see "Working style"), loaded automatically. Cited by rule ID
  in reviews.
- **Decision graph** — real-time logging, every commit linked to a node. See
  "Decision graph" below.
- **Git workflow** — this file's section above.

Stage 3 fires only for multi-PR work.

**Tracker.** Stages 3 and 6 assume **GitHub Issues** — where `/project-plan`
publishes the plan issue and `/review` reads specs. When no tracker is
configured, the plan lives in the first cut's PR description and review falls
back to the PR body's brief.

## Working style

The pipeline table above says which skill applies at which stage. Load the
relevant one when the stage applies; don't load for the sake of loading.

In-repo skills (`.claude/skills/`), copied from suede:

- `task` — the task spine, user-invoked. `brief.md` owns the brief format;
  `testing.md` owns test quality and the prune pass.
- `project-plan` — cut plan for work too big for one PR. User-invoked.
- `review` — three-axis review, dispatching to the in-repo reviewer agents.

Suede's `writing-css`, `design`, and `suede-kickoff` skills are left out: the
first two govern a UI this project doesn't have, and kickoff only runs in a
project the CLI just created.

In-repo agents (`.claude/agents/`): `standards-reviewer`, `spec-reviewer`, and
`discipline-reviewer` (dispatched by `review`), and `story-test-writer`
(dispatched by `task`).

Personal skills live in `~/.claude/skills/` and are not enumerated here.
`engineering-discipline`, `poke-holes`, and `systems-map` are the ones this
pipeline depends on. Install each by copying its folder from
[selvage](https://github.com/taurean/selvage/tree/main/dot_claude/exact_skills)
into `~/.claude/skills/<name>/`. They stay personal rather than in-repo, since a
personal skill shadows a project skill of the same name and an in-repo copy
would never run for anyone who has the personal one.

`deciduous update` maintains its own commands and hooks under `.claude/`.

## Task flow

`/task` owns the sequence end to end — alignment, prep, build, verify, review,
closeout. Alongside it, the supporting layer applies throughout: decision-graph
logging in real time and the co-authorship trailer. Verification and release
mechanics have their own sections below. The merge to `main` is human-only.

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

1. Note in the release PR description whether the decision graph answered a
   question this cycle — a `/pulse` consulted, a past decision that prevented
   re-litigating. Several releases of "no" in a row is the evidence for demoting
   the graph. The record is the point of this line.
2. Final commit is `chore(release): cut <version>`, touching only the version
   fields. `suede release [patch|minor|major]` makes this commit.
3. After the human merges, tag the merge commit on `main` with the bare version
   string, annotated, and push the tag. `suede release --tag` does both.
4. `git log <prev>..<new>` is the changelog.

Publishing to npm (`pnpm publish`, which builds first via `prepublishOnly`) is
human-only. It's irreversible in the ways that matter: a published version can't
be reused.

### Upstream lineage

`package.json#suede.from` is the suede tag this repo's process layer was copied
from. When suede's `CLAUDE.md`, `.claude/skills/{task,review,project-plan}`, or
`.claude/agents/` change, pull the change here and bump `from` in the same
commit.

## Decision graph

create-suede tracks project decisions with `deciduous`. `deciduous update`
writes and maintains its own Decision Graph Workflow section in this file, along
with the commands and hooks under `.claude/`. It preserves custom content, so
the house conventions below sit alongside the generated section rather than
replacing it. Don't restate the generated mechanics here.

**Log in real time, not retroactively.** Nothing enforces this mechanically:
deciduous 1.x removed the hook that blocked edits. The graph server's MCP
instructions restate the rule each session; the discipline is the agent's.

**Point every checkout at the graph server.** `[remote]` lives in the
gitignored `.deciduous/config.toml`, so run `deciduous remote setup --local`
once per machine and once in each new worktree. This checkout's directory is
`main`, so name the workspace: `deciduous remote init <url> --workspace
create-suede`.

### What not to log

**The graph records the user's project decisions, not the agent's internal
process.** This is the rule that keeps the graph readable, and it's the one most
easily lost.

Do **not** create nodes for reading or exploring the codebase, your planning
process, tool usage, context gathering, or meta-commentary about starting work.

Do create nodes for what the user asked for (goals), concrete approaches being
considered (options), choices made between them (decisions), code being written
(actions), results (outcomes), and technical findings that affect decisions
(observations).

**Rule of thumb:** if a node describes something the user would put on a project
timeline or in a PR description, log it. If it describes the process of reading
and thinking, don't.

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

<!-- prettier-ignore-start -->
<!-- deciduous:start -->
## Decision Graph Workflow

**THIS IS MANDATORY. Log decisions IN REAL-TIME, not retroactively.**

### Available Slash Commands

| Command | Purpose |
|---------|---------|
| `/decision` | Manage decision graph - add nodes, link edges, sync |
| `/recover` | Recover context from decision graph on session start |
| `/work` | Start a work transaction - creates goal node before implementation |
| `/document` | Generate comprehensive documentation for a file or directory |
| `/build-test` | Build the project and run the test suite |
| `/serve-ui` | Start the decision graph web viewer |
| `/decision-graph` | Build a decision graph from commit history |
| `/sync` | Check this copy against the graph server and refresh it |

### Available Skills

| Skill | Purpose |
|-------|---------|
| `/pulse` | Map current design as decisions (Now mode) |
| `/narratives` | Understand how the system evolved (History mode) |
| `/archaeology` | Transform narratives into queryable graph |

### The Node Flow Rule - CRITICAL

The canonical flow through the decision graph is:

```
goal -> options -> decision -> actions -> outcomes
```

- **Goals** lead to **options** (possible approaches to explore)
- **Options** lead to a **decision** (choosing which option to pursue)
- **Decisions** lead to **actions** (implementing the chosen approach)
- **Actions** lead to **outcomes** (results of the implementation)
- **Observations** attach anywhere relevant
- Goals do NOT lead directly to decisions -- there must be options first
- Options do NOT come after decisions -- options come BEFORE decisions
- Decision nodes should only be created when an option is actually chosen, not prematurely

### The Core Rule

```
BEFORE you do something -> Log what you're ABOUT to do
AFTER it succeeds/fails -> Log the outcome
CONNECT immediately -> Link every node to its parent
AUDIT regularly -> Check for missing connections
```

Through the MCP tools, create and link in one call: `add_node` with
`parent_id` set to the node it belongs under. Never send `add_edge` in the
same batch as the `add_node` whose id it needs: the id does not exist yet,
and whatever stands in for it (a placeholder, a guess) is refused.

### Behavioral Triggers - MUST LOG WHEN:

| Trigger | Log Type | Example |
|---------|----------|---------|
| User asks for a new feature | `goal` **with -p** | "Add dark mode" |
| Exploring possible approaches | `option` | "Use Redux for state" |
| Choosing between approaches | `decision` | "Choose state management" |
| About to write/edit code | `action` | "Implementing Redux store" |
| Something worked or failed | `outcome` | "Redux integration successful" |
| Notice something interesting | `observation` | "Existing code uses hooks" |

### What NOT to Log - CRITICAL

**The decision graph records the USER'S project decisions, not your internal process.**

Nodes should capture what the user is building, choosing, and accomplishing. Do NOT create nodes for your own thinking, planning, or tooling steps.

**DO NOT create nodes for:**
- Reading/exploring the codebase ("Analyzing project structure", "Reading config files")
- Your planning process ("Planning implementation approach", "Evaluating options internally")
- Tool usage ("Running tests to check status", "Checking git log")
- Context gathering ("Understanding existing auth code", "Reviewing PR comments")
- Meta-commentary ("Starting work on this task", "Preparing to implement")

**DO create nodes for:**
- What the user asked for (goals)
- Concrete approaches being considered (options)
- Choices made between approaches (decisions)
- Code being written or changed (actions)
- Results of implementation (outcomes)
- Technical findings that affect decisions (observations)

**Rule of thumb:** If a node describes something the user would put on a project timeline or in a PR description, log it. If it describes your internal process of reading and thinking, don't.

### Document Attachments

Attach files (images, PDFs, diagrams, specs, screenshots) to decision graph nodes for rich context.

```bash
# Attach a file to a node
deciduous doc attach <node_id> <file_path>
deciduous doc attach <node_id> <file_path> -d "Architecture diagram"
deciduous doc attach <node_id> <file_path> --ai-describe

# List documents
deciduous doc list              # All documents
deciduous doc list <node_id>    # Documents for a specific node

# Manage documents
deciduous doc show <doc_id>     # Show document details
deciduous doc describe <doc_id> "Updated description"
deciduous doc describe <doc_id> --ai   # AI-generate description
deciduous doc open <doc_id>     # Open in default application
deciduous doc detach <doc_id>   # Soft-delete (recoverable)
deciduous doc gc                # Remove orphaned files from disk
```

**When to suggest document attachment:**

| Situation | Action |
|-----------|--------|
| User shares an image or screenshot | Ask: "Want me to attach this to the current goal/action node?" |
| User references an external document | Ask: "Should I attach a copy to the decision graph?" |
| Architecture diagram is discussed | Suggest attaching it to the relevant goal node |
| Files not in the project are dropped in | Attach to the most relevant active node |

**Do NOT aggressively prompt for documents.** Only suggest when files are directly relevant to a decision node. Files are stored in `.deciduous/documents/` with content-hash naming for deduplication.

### CRITICAL: Capture VERBATIM User Prompts

**Prompts must be the EXACT user message, not a summary.** When a user request triggers new work, capture their full message word-for-word.

**BAD - summaries are useless for context recovery:**
```bash
# DON'T DO THIS - this is a summary, not a prompt
deciduous add goal "Add auth" -p "User asked: add login to the app"
```

**GOOD - verbatim prompts enable full context recovery:**
```bash
# Use --prompt-stdin for multi-line prompts
deciduous add goal "Add auth" -c 90 --prompt-stdin << 'EOF'
I need to add user authentication to the app. Users should be able to sign up
with email/password, and we need OAuth support for Google and GitHub. The auth
should use JWT tokens with refresh token rotation.
EOF

# Or use the prompt command to update existing nodes
deciduous prompt 42 << 'EOF'
The full verbatim user message goes here...
EOF
```

**When to capture prompts:**
- Root `goal` nodes: YES - the FULL original request
- Major direction changes: YES - when user redirects the work
- Routine downstream nodes: NO - they inherit context via edges

**Updating prompts on existing nodes:**
```bash
deciduous prompt <node_id> "full verbatim prompt here"
cat prompt.txt | deciduous prompt <node_id>  # Multi-line from stdin
```

Prompts are viewable in the web viewer.

### CRITICAL: Maintain Connections

**The graph's value is in its CONNECTIONS, not just nodes.**

| When you create... | IMMEDIATELY link to... |
|-------------------|------------------------|
| `outcome` | The action that produced it |
| `action` | The decision that spawned it |
| `decision` | The option(s) it chose between |
| `option` | Its parent goal |
| `observation` | Related goal/action |
| `revisit` | The decision/outcome being reconsidered |

**Root `goal` nodes are the ONLY valid orphans.**

### Quick Commands

```bash
deciduous add goal "Title" -c 90 -p "User's original request"
deciduous add action "Title" -c 85
deciduous link FROM TO -r "reason"  # DO THIS IMMEDIATELY!
deciduous serve   # View live (auto-refreshes every 30s)
deciduous remote status   # What this copy and the graph server disagree on

# Metadata flags
# -c, --confidence 0-100   Confidence level
# -p, --prompt "..."       Store the user prompt (use when semantically meaningful)
# -f, --files "a.rs,b.rs"  Associate files
# -b, --branch <name>      Git branch (auto-detected)
# --commit <hash|HEAD>     Link to git commit (use HEAD for current commit)
# --date "YYYY-MM-DD"      Backdate node (for archaeology)

# Branch filtering
deciduous nodes --branch main
deciduous nodes -b feature-auth
```

### CRITICAL: Link Commits to Actions/Outcomes

**After every git commit, link it to the decision graph!**

```bash
git commit -m "feat: add auth"
deciduous add action "Implemented auth" -c 90 --commit HEAD
deciduous link <goal_id> <action_id> -r "Implementation"
```

The `--commit HEAD` flag captures the commit hash and links it to the node. The web viewer will show commit messages, authors, and dates.

### Branch-Based Grouping

Nodes are auto-tagged with the current git branch. Configure in `.deciduous/config.toml`:
```toml
[branch]
main_branches = ["main", "master"]
auto_detect = true
```

### Audit Checklist (Before Ending a Session)

1. Does every **outcome** link back to what caused it?
2. Does every **action** link to why you did it?
3. Any **dangling outcomes** without parents?

### Git Staging Rules - CRITICAL

**NEVER use broad git add commands that stage everything:**
- ❌ `git add -A` - stages ALL changes including untracked files
- ❌ `git add .` - stages everything in current directory
- ❌ `git add -a` or `git commit -am` - auto-stages all tracked changes
- ❌ `git add *` - glob patterns can catch unintended files

**ALWAYS stage files explicitly by name:**
- ✅ `git add src/main.rs src/lib.rs`
- ✅ `git add Cargo.toml Cargo.lock`
- ✅ `git add .claude/commands/decision.md`

**Why this matters:**
- Prevents accidentally committing sensitive files (.env, credentials)
- Prevents committing large binaries or build artifacts
- Forces you to review exactly what you're committing
- Catches unintended changes before they enter git history

### Session Start Checklist

```bash
deciduous remote pull     # Refresh the local cache from the graph server
deciduous remote status   # Anything this copy has that the server lacks?
deciduous check-update    # Update needed? Run 'deciduous update' if yes
                          # (auto-checked every 24h if auto-update is on)
deciduous nodes           # What decisions exist?
deciduous edges           # How are they connected? Any gaps?
deciduous doc list        # Any attached documents to review?
deciduous board read --unanswered <label>  # parallel agents: anything waiting for you?
git status                # Current state
```

### Parallel Agents: The Message Board

When more than one agent works at once, coordinate through deciduous, never through a scratch or markdown file. A file has no ids to answer, no way to ask what is waiting for you, and it is gone with the worktree it was written in.

- **Post** interface changes, questions and answers: `post_message` (MCP) or `deciduous board post --as <your-label> -s "subject" -m "body"`. Address other agents with `@label`.
- **Read** what is waiting for you: `read_messages` with `unanswered_for: "<your-label>"`, or `deciduous board read --unanswered <your-label>`. Do it at start, before touching a file another agent may be changing, and before finishing.
- **Reply** with `reply_to: <id>` (`--reply-to <id>`). A reply is what takes a question off the asker's list; a new post does not.

One board serves every git worktree of the repository, or the server when the project has a `[remote]`. Messages are not graph nodes: not in `graph.json`, not exported, not synced. With `DECIDUOUS_AGENT_LABEL` set in a session's environment, `board post` uses it for `--as`, and the `board-mentions.sh` hook shows that label's unanswered messages at session start and as new ones arrive.

### The Graph Server

This project has a `[remote]` in `.deciduous/config.toml`: its graph lives on a shared server, and `.deciduous/deciduous.db` is this machine's cache of it. There is no `.deciduous/graph.json` to commit or merge, and `deciduous sync` is not the step here. Every CLI write is queued in `.deciduous/remote-log.jsonl` and sent before the command exits; MCP tools write to the server directly (pass the `workspace` named under `[remote]`).

```bash
deciduous remote status   # what differs between this copy and the server (exit 1 if anything)
deciduous remote pull     # send what is waiting, then refresh the local cache from the server
deciduous remote push     # send writes still waiting in the log (the server was down)
```

Local node ids differ per machine. To point at someone else's node, use its change_id prefix (the CHANGE column in `deciduous nodes`) or the server id an agent quotes: `deciduous link a1b2c3d4 <id> -r "..."`.
<!-- deciduous:end -->
<!-- prettier-ignore-end -->
