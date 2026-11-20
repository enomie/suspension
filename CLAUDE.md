# Notes for Claude

## Git workflow
- All changes land on `main`. The user wants everything on `main` and locally only runs `git pull`.
- If Claude works on a separate branch, merge the change to `main` via PR afterward, without asking back.
- After the merge, give the user the commands to pull (`git checkout main`, `git pull`, restart dev server).
- No force-push to `main`.
- Always push to `main`. Leave no branches open: delete any working branch (local and remote) once its work is on `main`.

## Quality bar
- Goal: production status, so the suspension code can be integrated into other games.
- The codebase is small; write it properly now (clean API, no hacks, documented, tested) rather than patching later.

## Wheels
- Wheel colliders are rounded cylinders and tori (hull), decided. Never ball colliders, and do not ask about it again.

## Language
- Conversation, answers, documentation, comments, and UI labels: **English only**.
- Code identifiers stay as they are (already English).