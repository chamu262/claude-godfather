# templates/hooks/

Hooks are commands Claude Code runs on events. Both are optional, and both are installed to `~/.claude/godfather/hooks/`.
The installer does not turn them on: it prints the lines to paste into `~/.claude/settings.json`.

| File | Event | What it does |
|---|---|---|
| `session-start.sh` | `SessionStart` | Prints a one-line reminder of the conventions that Claude sees at the start of each session. Changes nothing. |
| `notify-done.sh` | `Stop` | Shows a desktop notification when a session finishes a turn (macOS `osascript` or Linux `notify-send`). Always exits 0. |

The dashboard's Setup view lists whatever hooks are active.
