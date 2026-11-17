---
name: tidy-memory
description: Review Claude's file-based memory, merge duplicates, fix stale facts and keep MEMORY.md as a short index. Use when the user asks to tidy, clean up or review memory.
---

# Tidy memory

Memory lives in `~/.claude/projects/<project>/memory/`. One file holds one fact; `MEMORY.md` is a one-line-per-memory index.

## Steps

1. List every memory file with its `name`, `description` and `type` (user, feedback, project, reference).
2. Find duplicates (same fact, two files) and merge them into the clearer one.
3. Check facts that name a file, flag or command still exist. Mark stale ones and ask before deleting.
4. Convert relative dates ("next week") into absolute dates.
5. Rebuild `MEMORY.md`: one line each, `- [Title](file.md) — hook`, no content.
6. Show the user a before/after list. Delete nothing without a yes.

## A good memory file

```markdown
---
name: max-two-parallel
description: Run at most two sessions or subagents at once unless asked
metadata:
  type: feedback
---

Run at most two parallel sessions or subagents.
**Why:** the user watches usage limits closely.
**How to apply:** queue extra work instead of fanning out.
```
