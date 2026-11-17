---
name: session-handoff
description: Hand a long or off-topic task to a fresh session with a clean brief. Use when a session's context is very large, the user changes subject mid-task, or the Godfather dispatches work to a project folder.
---

# Session handoff

A fresh session with a short brief is cheaper and sharper than a long one that re-reads everything each turn.

## When

- The session has re-read more than ~5M tokens of context (the dashboard's advisor flags this).
- The user asks about something unrelated while a task is running.
- The work belongs in another folder or repo.

## Write the brief

A brief is the only context the new session gets. Include:

1. **Goal**: one sentence on what done looks like.
2. **Where**: folder, branch and the files that matter.
3. **Known so far**: facts already found, and what was ruled out.
4. **Rules**: anything the new session must not do (push, delete, touch other files).
5. **Report back**: what to put in the final message (start with the commit or PR link).

The dashboard drafts this for you: open the session, press **Draft handover brief**, then trim it.
It fills in goal, last exchange, done and open plan steps, files changed, skills used and the last 5 commits.

Keep it under 300 words. Write it in your own words, not "see above".

## After

- Note the new session's name in the old session's last message.
- If the old session has nothing left to do, offer to archive it.
