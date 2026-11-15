# Hinweise für Claude

## Git-Workflow
- Alle Änderungen landen auf `main`. Der Nutzer will alles immer auf `main` haben und lokal nur `git pull` machen.
- Arbeitet Claude auf einem eigenen Branch, wird die Änderung danach per PR nach `main` gemergt, ohne Rückfrage.
- Nach dem Merge dem Nutzer die Befehle zum Holen geben (`git checkout main`, `git pull`, Dev-Server neu starten).
- Kein Force-Push auf `main`.

## Sprache
- Antworten und Gespräch auf Deutsch.
- Code, Identifier, Code-Kommentare und Anzeigetexte (UI-Labels) immer nur auf Englisch.
- Bestehende deutsche Dateien nur dann ins Englische übersetzen, wenn sie ohnehin angefasst werden (nach und nach, kein Massen-Umbau).
