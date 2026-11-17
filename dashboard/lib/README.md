# dashboard/lib/

The dashboard's logic, kept apart from the web server so the tests can call it directly.

| File | What it does |
|---|---|
| `collect.mjs` | Reads a Claude folder: session transcripts (`projects/*/*.jsonl`, one JSON line per message), memory files, installed skills and hooks from `settings.json`. Gives each session a state (working, waiting, idle, stale), re-reads a transcript only when it changed, and skips an unreadable file instead of failing. Can read several Claude folders at once. |
| `stats.mjs` | Turns sessions into what the page shows: counts by state, token totals and cache hit, tokens per day / model / project, the rolling 5-hour and 7-day usage windows, collisions, open plan steps, advisor tips and search. Also `stillWorking` and `pauseProgress`, used by [`scripts/wait-idle.mjs`](../../scripts). |
| `handover.mjs` | Writes a **handover brief** (goal, folder, last exchange, open steps, files changed, skills used, recent commits) for starting a fresh session, and a Markdown export of a conversation. |

**Cache hit** is the share of input Claude read from its prompt cache, which is cheaper. **A collision** is a file that two
non-stale sessions have both edited.

Nothing here writes files or calls a model. Message text stays on the server; the overview sent to the page leaves it out.
