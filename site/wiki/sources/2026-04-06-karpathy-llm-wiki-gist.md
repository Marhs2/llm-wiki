---
title: "Karpathy LLM Wiki Gist"
type: "source"
kind: "gist"
created: "2026-04-06"
model: "gpt-4.1-mini"
backend: "heuristic"
source: "../../raw/sources/2026-04-06-karpathy-llm-wiki-gist.md"
---

# Karpathy LLM Wiki Gist

## Summary
A pattern for building personal knowledge bases using LLMs.

## Key claims
- A pattern for building personal knowledge bases using LLMs.

## Entities
- [[entities/openai]] (entity) — Detected heuristically in Karpathy LLM Wiki Gist.

## Concepts
- [[concepts/persistent-wiki]]

## Topics
- [[topics/knowledge]]

## Contradictions
- None noted.

## Source extract

> Karpathy LLM Wiki Gist Summary A pattern for building personal knowledge bases using LLMs. Key claims A pattern for building personal knowledge bases using LLMs. Entities entities/openai (entity) — Detected heuristically in Karpathy LLM Wiki Gist. Concepts concepts/persistent-wiki concepts/source-of-truth Topics topics/knowledge Contradictions None noted. Source extract Karpathy LLM Wiki Gist Summary A pattern for building personal knowledge bases using LLMs. Key claims A pattern for building personal knowledge bases using LLMs. This is an idea file, it is designed to be copy pasted to your own LLM Agent e.g. OpenAI Codex, Claude Code, OpenCode / Pi, or etc. Its goal is to communicate the high level idea, but your agent will build out the specifics in collaboration with you. Entities entities/openai (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/codex (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/claude-code (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/opencode (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/rag (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/notebooklm (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/chatgpt (entity) — Detected heuristically in Karpathy LLM Wiki Gist. entities/obsidian (entity) — Detected heuristically in Karpathy LLM Wiki Gist. Concepts concepts/persistent-wiki concepts/raw-sources concepts/synthesis concepts/compounding-artifact concepts/cross-references concepts/knowledge-base concepts/graph-view concepts/raw-sources Topics topics/knowledge topics/agent topics/openai topics/codex topics/query topics/markdown topics/index topics/obsidian Contradictions None noted. Source extract LLM Wiki A pattern for building personal knowledge bases using LLMs. This is an idea file, it is designed to be copy pasted to your own LLM Agent (e.g. OpenAI Codex, Claude Code, OpenCode / Pi, or etc.). Its goal is to communicate the high level idea, but your agent will build out the specifics in collaboration with you. The core idea Most people's experience with LLMs and documents looks like RAG: you upload a collection of files, the LLM retrieves relevant chunks at query time, and generates an answer. This works, but the LLM is rediscovering knowledge from scratch on every question. There's no accumulation. Ask a subtle question that requires synthesizing five documents, and the LLM has to find and piece together the relevant fragments every time. Nothing is built up. NotebookLM, ChatGPT file uploads, and most RAG systems work this way. The idea here is different. Instead of just retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources. When you add a new source, the LLM doesn't just index it for later retrieval. It reads it, extracts the key information, and integrates it into the existing wiki — updating entity pages, revising topic summaries, noting where new data contradicts old claims, strengthening or challenging the evolving synthesis. The knowledge is compiled once and then *kept current*, not re-derived on every query. This is the key difference: **the wiki is a persistent, compounding artifact.** The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read. The wiki keeps getting richer with every source you add and every question you ask. You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You're in charge of sourcing, exploration, and asking the right questions. The LLM does all the grunt work — the summarizing, cross-referencing, filing, and bookkeeping that makes a knowledge base actually useful over time. In practice, I have the LLM agent open on one side and Obsidian open on the other. The LLM makes edits based on our conversation, and I browse the results in real time — following links, checking the graph view, reading the updated pages. Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase. This can apply to a lot of different contexts. A few examples: **Personal**: tracking your own goals, health, psychology, self-improvement — filing journal entries, articles, podcast notes, and building up a structured picture of yourself over time. Links Related pages: Links entity: entities/openai (entity) — Detected heuristically in Karpathy LLM Wiki Gist. concept: concepts/persistent-wiki topic: topics/knowledge

## Links
- entity: [[entities/openai]] (entity) — Detected heuristically in Karpathy LLM Wiki Gist.
- concept: [[concepts/persistent-wiki]]
- topic: [[topics/knowledge]]
