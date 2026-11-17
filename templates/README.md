# templates/

Starting files that `../install.sh` copies into `~/.claude/godfather/`. It never overwrites a file you already have unless
you pass `--force`.

| File / folder | What it is |
|---|---|
| `CLAUDE.md` | Instructions for the Godfather's own folder: a projects table, hands-off rules, notes from masters and parked ideas. Copy it into the folder where your Godfather session lives. |
| [`hooks/`](hooks) | Two optional scripts Claude Code can run on events. |
| [`memory/`](memory) | An example of the memory layout: an index plus one fact per file. |
