# LLM Wiki

A minimal scaffold for a persistent, LLM-maintained knowledge base.

## Primary backend: Codex CLI

This project now prefers the local **Codex CLI** for analysis and wiki maintenance.

Set a custom Codex binary if needed:

```bash
export LLM_WIKI_CODEX_COMMAND=/path/to/codex
```

If Codex is installed normally, no extra configuration is needed.

## Optional fallback: OpenAI OAuth

OpenAI OAuth support is still available, but it is now optional.
Use it only if you want to force the OpenAI backend.

```bash
node scripts/llm-wiki.mjs auth login --client-id YOUR_CLIENT_ID
node scripts/llm-wiki.mjs auth set-token --token YOUR_TOKEN
node scripts/llm-wiki.mjs auth import --file ./openai-oauth.json
```

## What this project provides

- A vault layout for raw sources and generated wiki pages
- A modular Node CLI split across `scripts/lib/` instead of one monolithic script
- An ingest flow that copies a source into `vault/raw/sources/` and creates wiki notes
- Codex-backed summaries when Codex CLI is available
- Optional OpenAI OAuth fallback
- Auto-generated entity/concept/topic/answer pages and an index/log
- Static site build + Vercel deploy commands for the public viewer
- A small Node test suite for smoke-testing shared helpers

## Quick start

```bash
npm run init
npm run ingest -- --source ./path/to/source.md --title "Source Title"
npm run status
```

To force a backend:

```bash
npm run ingest -- --source ./path/to/source.md --backend codex
npm run ingest -- --source ./path/to/source.md --backend openai
npm run ingest -- --source ./path/to/source.md --backend heuristic
```

Useful maintenance commands:

```bash
node scripts/llm-wiki.mjs search --query codex
node scripts/llm-wiki.mjs query --question "What changed?" --write
node scripts/llm-wiki.mjs lint
node scripts/llm-wiki.mjs repair --dry-run
node scripts/llm-wiki.mjs build-site
npm test
```

## Layout

```text
vault/
  raw/
    sources/
    assets/
  wiki/
    index.md
    log.md
    entities/
    concepts/
    topics/
    answers/
    sources/

scripts/
  llm-wiki.mjs      # Thin CLI entrypoint
  lib/
    config.mjs
    utils.mjs
    markdown.mjs
    vault.mjs
    auth.mjs
    analysis.mjs
    commands.mjs
```
