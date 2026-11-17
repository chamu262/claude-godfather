# Session conventions

These are the habits the Godfather keeps. They work without the dashboard.

## Names

| Session | Title | Lives in |
|---|---|---|
| Supervisor | `The Godfather` (pinned first) | `~/Godfather` |
| Project lead | `<Project> — Master` (pinned) | the project folder |
| Worker | a short verb phrase: `Fix flaky login test` | the project folder, often its own git worktree |

A **worktree** is a second checkout of the same git repo on its own branch, so two sessions can work without touching each other's files.

## One task per session

- A worker does one task, reports, and is archived.
- Off-topic request mid-task? Hand the current task off (the `session-handoff` skill) and answer the new one.
- Context getting big (the dashboard flags over 5M tokens re-read)? Hand off with a short brief.

## Reports

- Start the final message with what changed: commit hash or PR link.
- Say what was **not** done or not checked.
- The Godfather checks the diff before calling anything done.

## Memory

- One fact per file in `~/.claude/projects/<project>/memory/`, with `name`, `description` and `type` in the frontmatter.
- Types: `user` (who you are), `feedback` (how Claude should work), `project` (goals and constraints), `reference` (where things live).
- `MEMORY.md` is only an index: one line per file.
- Don't store what the repo already records (code, git history).

## Safety

- No secrets in files, prompts or logs.
- Deleting anything needs an explicit yes each time.
- No activity stats about people, only about sessions and tokens.
