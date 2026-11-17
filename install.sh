#!/usr/bin/env bash
# One-command install of the Godfather setup for Claude Code.
#   ./install.sh            install into ~/.claude
#   ./install.sh --force    overwrite files that already exist
#   ./install.sh --check    change nothing; report what is installed and what is missing
#   CLAUDE_HOME=/tmp/x ./install.sh    install somewhere else (used by the tests)
# It never deletes anything and never edits settings.json; it prints the hook lines for you to add.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${CLAUDE_HOME:-$HOME/.claude}"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

if [[ "${1:-}" == "--check" ]]; then
  # Doctor mode: each line is ok / missing / optional. Exit code 1 only if something required is missing.
  missing=0
  ok()   { echo "  ok        $1"; }
  miss() { echo "  missing   $1  ->  $2"; missing=1; }
  opt()  { echo "  optional  $1  ->  $2"; }
  echo "Checking Godfather in $HOME_DIR"
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if (( major >= 18 )); then ok "Node $(node --version)"; else miss "Node 18+ (found $(node --version))" "install from https://nodejs.org"; fi
  else miss "Node 18+" "install from https://nodejs.org"; fi
  command -v claude >/dev/null 2>&1 && ok "Claude Code CLI" || opt "Claude Code CLI on PATH" "the desktop app works too"
  [[ -d "$HOME_DIR/projects" ]] && ok "Claude transcripts ($(find "$HOME_DIR/projects" -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ') sessions)" || opt "Claude transcripts" "open Claude Code once"
  for skill in "$REPO"/skills/*/; do
    name="$(basename "$skill")"
    [[ -f "$HOME_DIR/skills/$name/SKILL.md" ]] && ok "skill $name" || miss "skill $name" "run ./install.sh"
  done
  [[ -f "$HOME_DIR/godfather/CLAUDE.md" ]] && ok "templates in $HOME_DIR/godfather" || miss "templates" "run ./install.sh"
  if [[ -f "$HOME_DIR/settings.json" ]] && grep -q "godfather/hooks" "$HOME_DIR/settings.json"; then ok "hooks in settings.json"
  else opt "hooks in settings.json" "paste the lines ./install.sh prints"; fi
  port="${GODFATHER_PORT:-4417}"
  if command -v curl >/dev/null 2>&1 && curl -fsS -m 2 "http://127.0.0.1:$port/api/overview" >/dev/null 2>&1; then ok "dashboard running on port $port"
  else opt "dashboard on port $port" "npm start"; fi
  exit $missing
fi

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
