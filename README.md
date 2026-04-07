# LLM Wiki

Persistent, LLM-maintained wiki scaffold with a Codex-first workflow, modular CLI, interlinked markdown vault, and static Vercel viewer.

## Links

- GitHub: https://github.com/Marhs2/llm-wiki
- Live site: https://site-mu-puce.vercel.app

## What this project does

This repository implements the persistent wiki pattern described in Karpathy's LLM wiki gist:

- ingest raw sources into a growing markdown knowledge base
- maintain entity / concept / topic / answer pages
- keep a catalog-style `index.md` and time-ordered `log.md`
- lint and repair the wiki graph over time
- publish the current wiki as a searchable static site

## Primary backend: Codex CLI

This project prefers the local **Codex CLI** for analysis and wiki maintenance.

Set a custom Codex binary if needed:

```bash
export LLM_WIKI_CODEX_COMMAND=/path/to/codex
```

If Codex is installed normally, no extra configuration is needed.

## Optional fallback: OpenAI OAuth

OpenAI OAuth support is still available, but optional.
Use it only when you want to force the OpenAI backend.

```bash
node scripts/llm-wiki.mjs auth login --client-id YOUR_CLIENT_ID
node scripts/llm-wiki.mjs auth set-token --token YOUR_TOKEN
node scripts/llm-wiki.mjs auth import --file ./openai-oauth.json
```

## Features

- modular Node CLI split across `scripts/lib/`
- vault layout for raw sources and generated wiki pages
- Codex-backed ingest with heuristic fallback
- query / search / lint / repair maintenance commands
- auto-generated entity, concept, topic, answer, source, index, and log pages
- static site build with manifest metadata for filters and related-page navigation
- API-style JSON output under `site/api/` for programmatic access
- Vercel deployment workflow for public browsing
- small Node test suite for shared helpers

## Quick start

```bash
npm install
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
node scripts/llm-wiki.mjs search --query "persistent wiki"
node scripts/llm-wiki.mjs graph --limit 10
node scripts/llm-wiki.mjs query --question "What changed?" --write
node scripts/llm-wiki.mjs lint
node scripts/llm-wiki.mjs repair
node scripts/llm-wiki.mjs build-site
node scripts/llm-wiki.mjs serve --host 0.0.0.0 --port 3030
node scripts/llm-wiki.mjs deploy --prod --yes
npm test
```

For live local API hosting, run:

```bash
npm run serve -- --host 0.0.0.0 --port 3030
# or let the CLI auto-pick a free port
npm run serve -- --host 127.0.0.1 --port 0
```

That server reads `vault/wiki` on every request, so if you edit the wiki locally the API responses change immediately without rebuilding. If the requested port is already in use, the command now fails fast instead of hanging silently.

After `build-site`, API-style JSON files are available at:

```text
site/api/index.json
site/api/graph.json
site/api/pages/*.json
```

## Automation

This repo includes a GitHub Actions workflow at `.github/workflows/ci-vercel.yml` that:

- runs tests on pushes and pull requests
- lints the wiki
- rebuilds the static wiki site
- uploads the built site as a workflow artifact

Separately, the Vercel project is now connected directly to this GitHub repository, so pushes to `main` can trigger Vercel deployments through the Git integration.

Current linked Vercel values for this project:

- `VERCEL_ORG_ID=team_2tA7Ens8fc9xQMEDRDcPFnL7`
- `VERCEL_PROJECT_ID=prj_vghY14zqws05fJzqZoTJofYXUbZ6`

## Realtime mode

The public viewer now supports a Firestore-backed realtime mode. When the wiki pages are mirrored into a Firestore collection named `wiki_pages`, the site subscribes to live updates and rerenders without a rebuild. If Firestore is unavailable, the viewer falls back to the generated API files in `site/api/`.

The browser app uses the Firebase Web SDK and the project config defined in `site/app.js`. The installed `firebase` package is included for SDK parity and future bundling/sync work.

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

site/
  index.html
  app.js
  style.css
  data/wiki-index.json
  wiki/

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

## Typical workflow

```bash
npm run ingest -- --source ./notes/source.md --title "New source"
node scripts/llm-wiki.mjs repair
node scripts/llm-wiki.mjs lint
node scripts/llm-wiki.mjs build-site
```

## Deployment notes

- The Vercel project is connected to `https://github.com/Marhs2/llm-wiki`
- The static site is served from the `site/` directory
- Local production deployment is also available with `node scripts/llm-wiki.mjs deploy --prod --yes`
