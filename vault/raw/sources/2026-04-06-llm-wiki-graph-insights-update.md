# LLM Wiki Graph Insights Update

The LLM Wiki project now includes explicit graph analysis and backlink-aware browsing.

## Added capabilities

- A new CLI command: `node scripts/llm-wiki.mjs graph --limit 10`
- Graph metrics now calculate page connectivity across the wiki.
- Each page can now expose:
  - `backlinks`
  - `backlinkCount`
  - `hubScore`
- The static site manifest now includes graph metadata.
- The public viewer now shows graph context, incoming links, outgoing links, and hub score.

## Why this matters

- A persistent wiki becomes more valuable as pages cross-reference each other.
- Graph analysis helps identify hub pages, isolated pages, and weakly connected concepts.
- Backlink-aware browsing makes the public site feel more like a real wiki than a flat search result list.

## Current observations

- `wiki/index.md` is the dominant hub page.
- `wiki/log.md` remains comparatively isolated.
- The graph feature gives a direct way to measure whether the wiki is compounding over time.

## Follow-ups

- Use hub scores and backlinks to improve query ranking.
- Add a dedicated graph dashboard page to the static site.
- Use graph signals in linting to find important but underdeveloped pages.
