---
name: project-plan
description: >
  Plan work too big for one PR as a short sequence of independently-mergeable
  cuts, published as a single plan issue. User-invoked when a feature involves a
  big rewrite or several sizeable cuts that could merge on their own.
disable-model-invocation: true
---

# Project plan

Carve work that cannot land as one PR into **cuts**: PR-sized units that merge
independently, each leaving the app shippable.

If the goal fits in one PR, stop here and run `/task`.

## 1. Interview

Short back-and-forth per `/poke-holes`: one question per message, each with a
one-line recommended answer. Stop when the load-bearing unknowns resolve.

What has to come out of it:

- **The end state** — what is true when the whole plan is done.
- **What must keep working after every merge** — the app stays shippable
  between cuts, so this is the constraint that shapes where the cuts fall.
- **The seams that let cuts merge independently** — existing seams first.
- **What's hard to undo** ([REV-1]) and which cut carries it. An irreversible
  step concentrated in one cut is easier to review carefully than the same step
  spread across three.
- **The decisions that constrain every cut** — the calls made here that later
  cuts must not relitigate.

## 2. Draft the cut map

An ordered list. Per cut:

- **Title** — short enough to become a branch name.
- **Outcome** — one sentence, user-observable.
- **Stories** — one to three "Done when" lines
  (`<user> can <do X> and observes <Y>`). These become the cut's test list, so
  restraint here is restraint everywhere downstream.
- **Blocked by** — earlier cuts it needs, if any.
- **Irreversible** — flagged if this cut carries the hard-to-undo step.

A cut earns its place by being independently mergeable **and** worth its own
review cycle. If two cuts would be reviewed together anyway, merge them. Prefer
few sizeable cuts over many small ones — every extra cut is another PR the human
reads.

A cut MUST NOT mix behavior and structure ([SLICE-2]). Restructuring that later
cuts depend on is its own cut, ordered first.

## 3. Confirm

Show the map. Ask three things: granularity (too coarse or too fine), order, and
whether each cut is truly mergeable alone. Iterate until approved.

## 4. Publish one issue

One tracker issue holds the whole plan. Do **not** open an issue per cut — the
plan issue is the spec, and each cut's PR links it and checks off its box on
merge.

The issue carries five sections:

**Problem** — what the current state costs. Same standard as a brief's problem
section: the price, not the failure description.

**End state** — what is true when every cut has landed.

**Decisions** — the calls that constrain every cut, each with its reasoning. This
is the section you'll actually come back for after a gap: what was chosen, and
why, so a later cut doesn't quietly reverse it. Name interfaces, contracts, and
shapes. Don't name file paths or paste code — those go stale. One exception: if
a prototype produced a snippet that encodes a decision more precisely than prose
can (a state machine, a schema, a type shape), inline the decision-rich part and
note where it came from.

**Out of scope** — what this plan doesn't claim, and what someone reading the end
state would reasonably assume it claims but it doesn't. Over-specify. Each cut's
brief inherits this and narrows it further.

**Cuts** — the map as a task checklist, in order.

## 5. Run each cut

`/task` per cut. The brief inherits that cut's stories, the plan's out-of-scope
list, and a link back to the plan issue in its header.

## 6. Re-plan as cuts land

After each merged cut, revisit the map — later cuts learn from earlier ones the
same way slices do. Edit the plan issue in place; don't regenerate it. Record
what changed and why in the Decisions section, since a reversal that isn't
written down reads as an accident to whoever finds it next.
