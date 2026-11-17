# skills/

Skills are instruction files Claude Code loads when a task matches their description. Each folder holds one `SKILL.md`.
`../install.sh` copies them into `~/.claude/skills/`, where every session can use them.

| Skill | What it does |
|---|---|
| [`godfather`](godfather) | Runs one supervisor session that watches, organises and dispatches work to other sessions. |
| [`session-handoff`](session-handoff) | Hands a large or off-topic task to a fresh session with a short brief. |
| [`tidy-memory`](tidy-memory) | Merges duplicate memory files, fixes stale ones and keeps the index short. |

Together they cover the loop: the Godfather spots a problem on the dashboard, hands work off, and keeps memory clean.
