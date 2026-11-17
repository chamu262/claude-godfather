# templates/memory/

An example of Claude Code's file-based memory: one fact per file, plus an index. Installed to
`~/.claude/godfather/memory-template/` for reference. Real memory lives in `~/.claude/projects/<project>/memory/`.

| File | What it is |
|---|---|
| `MEMORY.md` | The index: one line per memory file, `- [name](file.md) — hook`. No content goes here. |
| `prefers-plain-words.md` | One memory file. Frontmatter (`name`, `description`, `metadata.type`) and then the fact. |

Types: `user` (who you are), `feedback` (how Claude should work), `project` (goals and limits), `reference` (where things
live). The [`tidy-memory`](../../skills/tidy-memory) skill keeps these clean.
