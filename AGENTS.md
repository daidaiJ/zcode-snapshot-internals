# Agent map — zcode-snapshot-internals

Security-research reconstruction of ZCode Desktop 3.12.2 repo-snapshot upload. Not a product codebase.

## Where to read

1. `README.md` — claims + identifier table + legal disclaimer
2. `src/readable/` — walkthrough copy (keepNames + prettier). **Do not cite as ZCode source.**
3. `src/01-*.js` … `src/08-*.js` — **verbatim minified excerpts; cite these**
4. `docs/02-code-flow.md` — six-stage walkthrough (links both)
5. `docs/04-hardening.md` — how to stop the upload
6. `tools/README.md` — asar extract + keepNames scripts (Grok Build)

## Do not

- Quote `src/readable/` as the original or as a drop-in ZCode module
- Expand scope into exploit / upload-client tooling
- Commit `.extract/` (full host bundle) or `__pycache__/`

## Regen

From a machine with ZCode installed (`D:\Programs\zcode\resources\app.asar` on this host):

```
python tools/extract_snapshot.py
python tools/beautify_snapshot.py
npx prettier --write src/readable/*.js
```
