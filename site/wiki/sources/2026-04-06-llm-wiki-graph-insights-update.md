---
title: "LLM Wiki Graph Insights Update"
type: "source"
kind: "source"
created: "2026-04-06"
model: "gpt-4.1-mini"
backend: "heuristic"
source: "../../raw/sources/2026-04-06-llm-wiki-graph-insights-update.md"
---

# LLM Wiki Graph Insights Update

## Summary
The LLM Wiki project now includes explicit graph analysis and backlink-aware browsing.

## Key claims
- The LLM Wiki project now includes explicit graph analysis and backlink-aware browsing.
- - A new CLI command:  node scripts/llm-wiki.mjs graph --limit 10  - Graph metrics now calculate page connectivity across the wiki.
- - Each page can now expose: -  backlinks  -  backlinkCount  -  hubScore  - The static site manifest now includes graph metadata.
- - The public viewer now shows graph context, incoming links, outgoing links, and hub score.

## Entities
- [[entities/cli]] (entity) — Detected heuristically in LLM Wiki Graph Insights Update.

## Concepts
- [[concepts/persistent-wiki]]

## Topics
- [[topics/index]]
- [[topics/query]]

## Contradictions
- None noted.

## Source extract

> # LLM Wiki Graph Insights Update
> The LLM Wiki project now includes explicit graph analysis and backlink-aware browsing.
> ## Added capabilities
> - A new CLI command: `node scripts/llm-wiki.mjs graph --limit 10`
> - Graph metrics now calculate page connectivity across the wiki.
> - Each page can now expose:
> - `backlinks`
> - `backlinkCount`
> - `hubScore`
> - The static site manifest now includes graph metadata.

## Links
- entity: [[entities/cli]]
- concept: [[concepts/persistent-wiki]]
- topic: [[topics/index]]
- topic: [[topics/query]]
