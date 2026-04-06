---
title: "Answer: What are the core layers and workflows of the llm wiki pattern?"
type: "answer"
created: "2026-04-06"
updated: "2026-04-06"
sources: ["[[sources/2026-04-06-karpathy-llm-wiki-gist]]", "[[sources/2026-04-06-llm-wiki-agent-guide]]", "[[sources/2026-04-06-llm-wiki-launch-roadmap]]", "[[sources/2026-04-06-llm-wiki-readme]]", "[[entities/llm-wiki]]"]
---

# Answer: What are the core layers and workflows of the llm wiki pattern?

## Summary
핵심 계층은 raw sources(불변 원문), the wiki(LLM이 유지하는 markdown 지식층), 그리고 schema/AGENTS.md 같은 운영 규칙 문서다.

## Answer
질문: What are the core layers and workflows of the llm wiki pattern?

이 답변은 5개의 위키 페이지를 바탕으로 생성되었습니다.

## Short answer
- 핵심 계층은 raw sources(불변 원문), the wiki(LLM이 유지하는 markdown 지식층), 그리고 schema/AGENTS.md 같은 운영 규칙 문서다.

## Layers
- Raw sources: 수정하지 않는 원문 저장소로서 source of truth 역할을 한다.
- Wiki pages: source를 바탕으로 summary, entity, concept, topic, answer 페이지를 누적 관리한다.
- Schema / agent rules: ingest, query, lint, linking 규칙을 정의해 일관된 유지보수를 가능하게 한다.

## Workflows
- Ingest: 새 source를 읽고 요약/핵심 주장/개념/토픽을 추출해 여러 wiki 페이지를 갱신한다.
- Query: index와 관련 페이지를 읽어 답변을 만들고, 가치 있는 답은 answer 페이지로 다시 저장한다.
- Lint: broken link, orphan, coverage 부족, 수상한 entity, underlinked concept를 점검한다.

## Key points
- A pattern for building personal knowledge bases using LLMs.
- This repository is a scaffold for a persistent wiki maintained by an LLM.
- The current LLM Wiki project is evolving from a scaffold into a deployable public knowledge base.
- A minimal scaffold for a persistent, LLM-maintained knowledge base.

## Core concepts
- persistent-wiki
- knowledge-base

## Contradictions
- No explicit contradictions were recorded in the referenced pages.

## Evidence pages
- [[sources/2026-04-06-karpathy-llm-wiki-gist]] — A pattern for building personal knowledge bases using LLMs.
- [[sources/2026-04-06-llm-wiki-agent-guide]] — This repository is a scaffold for a persistent wiki maintained by an LLM.
- [[sources/2026-04-06-llm-wiki-launch-roadmap]] — The current LLM Wiki project is evolving from a scaffold into a deployable public knowledge base.
- [[sources/2026-04-06-llm-wiki-readme]] — A minimal scaffold for a persistent, LLM-maintained knowledge base.
- [[entities/llm-wiki]] — Detected heuristically in LLM Wiki Launch Roadmap.

## Suggested follow-ups
- Drill deeper into [[sources/2026-04-06-karpathy-llm-wiki-gist]] and strengthen linked entity/concept/topic pages.
- Drill deeper into [[sources/2026-04-06-llm-wiki-agent-guide]] and strengthen linked entity/concept/topic pages.
- Drill deeper into [[sources/2026-04-06-llm-wiki-launch-roadmap]] and strengthen linked entity/concept/topic pages.

## Sources
- [[sources/2026-04-06-karpathy-llm-wiki-gist]]
- [[sources/2026-04-06-llm-wiki-agent-guide]]
- [[sources/2026-04-06-llm-wiki-launch-roadmap]]
- [[sources/2026-04-06-llm-wiki-readme]]
- [[entities/llm-wiki]]
