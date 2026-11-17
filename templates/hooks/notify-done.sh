#!/usr/bin/env bash
# Stop hook: a desktop notification when a session finishes a turn (macOS and Linux). Safe to remove.
msg="Claude finished a turn"
if command -v osascript >/dev/null 2>&1; then osascript -e "display notification \"$msg\" with title \"Godfather\"" >/dev/null 2>&1
elif command -v notify-send >/dev/null 2>&1; then notify-send "Godfather" "$msg"; fi
exit 0
