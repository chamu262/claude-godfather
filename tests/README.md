# tests/

Tests use Node's built-in test runner, so there is nothing to install.

```bash
npm test
```

| File | What it checks |
|---|---|
| `collect.test.mjs` | Reading transcripts: bad lines skipped, tokens, files, plans and subagents counted, state by age, frontmatter. |
| `dashboard.test.mjs` | On the demo data: every state present, collisions found (stale ones left out), advisor tips, open steps, the Setup lists, and the server (API, page, blocked path escape). |
| `features.test.mjs` | Running tool calls, skills used, re-reading only changed files, unreadable files skipped, several Claude folders, usage windows, search, wait-idle helpers, handover brief and export, message text kept on the server, and read-only endpoints. |
| `watch.test.mjs` | The page helpers: state settling without flicker, and "done, unseen" marking. |
| `install.test.mjs` | `install.sh` in a temp folder: writes skills, templates and hooks, never touches `settings.json`, and keeps your files unless `--force`. |

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs these on Ubuntu and macOS with Node 18 and 22.
