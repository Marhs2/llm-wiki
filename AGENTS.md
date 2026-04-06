# Agent Guide for LLM Wiki

This repository is a scaffold for a persistent wiki maintained by an LLM.

## Core rules

1. Treat `vault/raw/` as immutable source material.
2. Write generated content only into `vault/wiki/`.
3. Update `vault/wiki/index.md` when new pages are added.
4. Append every meaningful action to `vault/wiki/log.md`.
5. Prefer small, interlinked markdown pages over large monolith notes.
6. Primary backend: Codex CLI. Keep OpenAI OAuth as an optional fallback only.
7. Read Codex availability from the local environment; allow `LLM_WIKI_CODEX_COMMAND` to override the binary path.

## Ingest workflow

When a new source arrives:
1. Read the source.
2. Extract key claims, entities, and topics.
3. Create or update relevant wiki pages.
4. Add links between related pages.
5. Record the action in `log.md`.

## Query workflow

When answering a question:
1. Read `index.md` first.
2. Open the relevant wiki pages.
3. Synthesize an answer with citations or page links.
4. If the answer is reusable, write it back into the wiki.

## Lint workflow

Periodically check for:
- stale claims
- duplicate pages
- orphan pages
- broken links
- missing cross-references

Use the CLI when helpful:
- `node scripts/llm-wiki.mjs search --query <term>`
- `node scripts/llm-wiki.mjs lint`

## Conventions

- Use Obsidian-style wiki links where helpful: `[[page-name]]`
- Keep page titles short and specific
- Use YAML frontmatter for metadata on generated pages
- Prefer append-only logs
