---
title: "LLM Wiki Automation Update"
type: "source"
kind: "source"
created: "2026-04-06"
model: "gpt-4.1-mini"
backend: "heuristic"
source: "../../raw/sources/2026-04-06-llm-wiki-automation-update.md"
---

# LLM Wiki Automation Update

## Summary
The LLM Wiki project now has a working GitHub + Vercel automation path.

## Key claims
- The LLM Wiki project now has a working GitHub + Vercel automation path.
- - The codebase is published at  https://github.com/Marhs2/llm-wiki .
- - GitHub Actions now runs on pushes and pull requests.
- - CI uses  package-lock.json  and  npm ci  so installs are reproducible.

## Entities
- [[entities/vercel]] (entity) — Detected heuristically in LLM Wiki Automation Update.
- [[entities/vercel-git]] (entity) — Detected heuristically in LLM Wiki Automation Update.

## Concepts
- [[concepts/workflow]]
- [[concepts/ingest]]

## Topics
- [[topics/workflow]]
- [[topics/ingest]]

## Contradictions
- None noted.

## Source extract

> # LLM Wiki Automation Update
> The LLM Wiki project now has a working GitHub + Vercel automation path.
> ## New state
> - The codebase is published at `https://github.com/Marhs2/llm-wiki`.
> - GitHub Actions now runs on pushes and pull requests.
> - CI uses `package-lock.json` and `npm ci` so installs are reproducible.
> - The Vercel project is linked to the GitHub repository and deploys from the `site/` root directory.
> - The live site is available at `https://site-mu-puce.vercel.app`.
> ## Why this matters
> - The wiki is no longer just a local prototype; it now has a durable public deployment path.

## Links
- entity: [[entities/vercel]]
- entity: [[entities/vercel-git]]
- concept: [[concepts/workflow]]
- concept: [[concepts/ingest]]
- topic: [[topics/workflow]]
- topic: [[topics/ingest]]
