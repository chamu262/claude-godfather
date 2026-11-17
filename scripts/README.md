# scripts/

Command-line helpers that use the same logic as the dashboard.

| File | What it does |
|---|---|
| `wait-idle.mjs` | Waits until no Claude Code session is working, then exits 0. It exits 1 if time runs out. Run it before housekeeping (archiving, cleaning worktrees, updating skills) so nothing changes under a busy session. |

```bash
node scripts/wait-idle.mjs --timeout 120
```

Options: `--timeout <seconds>` (default 600), `--every <seconds>` between checks (default 5). It reads `GODFATHER_HOME` like
the dashboard.
