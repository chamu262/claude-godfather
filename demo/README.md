# demo/

Made-up data so you can try the dashboard, and so the tests have something fixed to check.

| File | What it does |
|---|---|
| `generate.mjs` | Writes a fictional Claude folder: 9 sessions across 4 invented projects (`home-hq`, `acme-web`, `garden-api`, `notes-app`), 4 memory files, the repo's own skills and 2 hooks. Seeded, so it looks the same every run. Sessions are spread across every state, and two of them edit the same file so there is a collision to show. |

```bash
npm run demo                           # builds it in a temp folder and starts the dashboard
```

```bash
node demo/generate.mjs ./demo-home     # just write the folder (git ignores demo-home/)
```

Every name, path and number in it is invented. All screenshots in [`docs/screenshots`](../docs/screenshots) come from it.
