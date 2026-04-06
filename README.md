# LLM Wiki

A minimal scaffold for a persistent, LLM-maintained knowledge base.

## Auth mode

This project prefers **OpenAI OAuth bearer tokens** over API keys.

### Option A: interactive OAuth login

```bash
node scripts/llm-wiki.mjs auth login --client-id YOUR_CLIENT_ID
```

The CLI uses a local PKCE callback flow. You can override endpoints if needed:

```bash
node scripts/llm-wiki.mjs auth login   --client-id YOUR_CLIENT_ID   --authorize-url https://auth.openai.com/oauth/authorize   --token-url https://auth.openai.com/oauth/token   --redirect-uri http://127.0.0.1:43112/callback
```

### Option B: store an existing token

```bash
node scripts/llm-wiki.mjs auth set-token --token YOUR_TOKEN
node scripts/llm-wiki.mjs auth import --file ./openai-oauth.json
```

### Option C: environment variable

```bash
export OPENAI_OAUTH_TOKEN=YOUR_TOKEN
```

Token file location:

```text
~/.config/llm-wiki/openai-oauth.json
```

## What this project provides

- A vault layout for raw sources and generated wiki pages
- A small Node CLI to initialize the vault
- An ingest flow that copies a source into `vault/raw/sources/` and creates wiki notes
- Optional OpenAI-backed summaries when an OAuth bearer token is available
- Auto-generated entity/topic pages and an index/log

## Quick start

```bash
npm run init
node scripts/llm-wiki.mjs auth login --client-id YOUR_CLIENT_ID
npm run ingest -- --source ./path/to/source.md --title "Source Title"
npm run status
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
    sources/
```

## Next step

If you have the exact OpenAI OAuth app settings, I can wire the defaults to match them more tightly.
