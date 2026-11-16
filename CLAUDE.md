# Notes for Claude

## Git workflow
- All changes land on `main`. The user wants everything on `main` and locally only runs `git pull`.
- If Claude works on a separate branch, merge the change to `main` via PR afterward, without asking back.
- After the merge, give the user the commands to pull (`git checkout main`, `git pull`, restart dev server).
- No force-push to `main`.

## Language
- Conversation, answers, documentation, comments, and UI labels: **English only**.
- Code identifiers stay as they are (already English).