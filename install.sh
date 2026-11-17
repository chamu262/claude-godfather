#!/usr/bin/env bash
# One-command install of the Godfather setup for Claude Code.
#   ./install.sh            install into ~/.claude
#   ./install.sh --force    overwrite files that already exist
#   CLAUDE_HOME=/tmp/x ./install.sh    install somewhere else (used by the tests)
# It never deletes anything and never edits settings.json; it prints the hook lines for you to add.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${CLAUDE_HOME:-$HOME/.claude}"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

copy() { # copy SRC DEST, skip if it exists unless --force
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" && $FORCE -eq 0 ]]; then echo "  keep   $dest (exists)"; return; fi
  cp "$src" "$dest"; echo "  write  $dest"
}

echo "Installing Godfather into $HOME_DIR"
command -v node >/dev/null 2>&1 || echo "  note: Node 18+ is needed for the dashboard (https://nodejs.org)"

for skill in "$REPO"/skills/*/; do
  name="$(basename "$skill")"
  copy "$skill/SKILL.md" "$HOME_DIR/skills/$name/SKILL.md"
done

GF="$HOME_DIR/godfather"
copy "$REPO/templates/CLAUDE.md" "$GF/CLAUDE.md"
for f in "$REPO"/templates/memory/*.md; do copy "$f" "$GF/memory-template/$(basename "$f")"; done
for f in "$REPO"/templates/hooks/*.sh; do copy "$f" "$GF/hooks/$(basename "$f")"; chmod +x "$GF/hooks/$(basename "$f")"; done
echo "$REPO" > "$GF/repo-path"

cat <<MSG

Done. Next steps:
  1. Add the hooks to $HOME_DIR/settings.json (optional):
       "hooks": {
         "SessionStart": [{"matcher": "startup", "hooks": [{"type": "command", "command": "$GF/hooks/session-start.sh"}]}],
         "Stop":         [{"hooks": [{"type": "command", "command": "$GF/hooks/notify-done.sh"}]}]
       }
  2. Start the dashboard:     npm start --prefix "$REPO"     (or: npm run demo --prefix "$REPO")
  3. In Claude Code, say:     set up the Godfather
MSG
