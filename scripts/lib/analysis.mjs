import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODEX_COMMAND, DEFAULT_MODEL, OPENAI_API_URL, REPO_ROOT } from './config.mjs';
import { commandAvailable, normalizeList, safeJsonParse, writeJson } from './utils.mjs';
import { readOAuthRecord, getActiveOAuthRecord } from './auth.mjs';

export function buildCodeXSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'key_claims', 'entities', 'concepts', 'topics', 'contradictions'],
    properties: {
      summary: { type: 'string' },
      key_claims: { type: 'array', items: { type: 'string' } },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type', 'note'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      concepts: { type: 'array', items: { type: 'string' } },
      topics: { type: 'array', items: { type: 'string' } },
      contradictions: { type: 'array', items: { type: 'string' } },
    },
  };
}

export function heuristicAnalysis(title, sourceText) {
  const titleWords = new Set(title.toLowerCase().split(/\s+/).filter(Boolean));
  const stopTopicWords = new Set(['sample', 'source', 'the', 'and', 'with', 'for', 'from', 'this', 'that', 'wiki']);
  const stopEntityWords = new Set(['the', 'this', 'and', 'that', 'there', 'most', 'some', 'many', 'you', 'your', 'its', 'their', 'they', 'then', 'when', 'where', 'what', 'which', 'none', 'one', 'two', 'three', 'append', 'fill', 'write', 'read', 'keep', 'update', 'set', 'use', 'prefer', 'primary', 'optional', 'connect', 'upgrade', 'auto', 'automate', 'if', 'ask', 'treat']);
  const contentLines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s+/.test(line));
  const body = contentLines.join(' ');
  const plain = body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`\[\]()]/g, ' ');
  const sent = plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const explicitEntities = [...new Set([
    ...(sourceText.match(/\b(?:OpenAI|Codex CLI|Codex|Claude Code|OpenCode|Obsidian|NotebookLM|ChatGPT|RAG|Memex|Marp|Dataview|Tolkien Gateway|Vannevar Bush|Bush)\b/g) || []),
  ])];
  const properNouns = [...new Set((plain.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,2}\b/g) || []))]
    .filter((name) => {
      const lower = name.toLowerCase();
      const words = lower.split(/\s+/);
      const occurrenceCount = (sourceText.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length;
      const isAcronym = /^[A-Z0-9]{2,6}$/.test(name);
      const isMultiword = words.length > 1;
      return name.length > 2
        && words.every((word) => !stopEntityWords.has(word))
        && !titleWords.has(lower)
        && (isAcronym || isMultiword || occurrenceCount > 1 || explicitEntities.includes(name));
    });
  const topicSeeds = [...new Set([
    ...title.toLowerCase().split(/\s+/),
    ...(plain.toLowerCase().match(/\b(?:wiki|llm|openai|obsidian|research|product|design|tool|model|api|workflow|knowledge|note|agent|markdown|oauth|codex|query|lint|ingest|index|log|source)\b/g) || []),
  ])]
    .map((s) => String(s).trim())
    .filter((s) => {
      const lower = s.toLowerCase();
      return lower && lower.length > 3 && !stopTopicWords.has(lower) && !titleWords.has(lower);
    });
  const conceptSeeds = [...new Set([
    ...(plain.match(/\b(?:persistent wiki|knowledge base|cross-references|synthesis|query workflow|ingest workflow|lint workflow|search engine|raw sources|source of truth|graph view|indexing and logging|content-oriented catalog|append-only log|compounding artifact)\b/gi) || []),
    ...topicSeeds.filter((item) => item.length > 5),
  ])];
  const keyClaims = sent.slice(0, 5).filter((line) => line.length > 40).slice(0, 4);
  return {
    summary: sent[0] || `Source ingested for ${title}. No model backend was available, so this is a placeholder summary.`,
    key_claims: keyClaims.length ? keyClaims : contentLines.slice(0, 3),
    entities: [...new Set([...explicitEntities, ...properNouns])].slice(0, 8).map((name) => ({ name, type: 'entity', note: `Detected heuristically in ${title}.` })),
    concepts: conceptSeeds.slice(0, 8),
    topics: topicSeeds.slice(0, 8),
    contradictions: [],
  };
}

export function normalizeAnalysis(raw, title) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const entities = Array.isArray(data.entities)
    ? data.entities
        .map((entry) => {
          if (typeof entry === 'string') return { name: entry, type: 'entity', note: `Mentioned in ${title}.` };
          if (!entry || typeof entry !== 'object') return null;
          const name = String(entry.name || '').trim();
          if (!name) return null;
          return {
            name,
            type: String(entry.type || 'entity').trim() || 'entity',
            note: String(entry.note || `Mentioned in ${title}.`).trim(),
          };
        })
        .filter(Boolean)
    : [];
  return {
    summary: String(data.summary || '').trim(),
    key_claims: normalizeList(data.key_claims),
    entities,
    concepts: normalizeList(data.concepts),
    topics: normalizeList(data.topics),
    contradictions: normalizeList(data.contradictions),
  };
}

export async function runCodexAnalysis({ title, sourceText, model }) {
  if (!(await commandAvailable(CODEX_COMMAND))) {
    return { analysis: null, warning: `Codex command not found: ${CODEX_COMMAND}` };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-codex-'));
  const schemaPath = path.join(tempDir, 'output-schema.json');
  const outputPath = path.join(tempDir, 'last-message.txt');
  await writeJson(schemaPath, buildCodeXSchema());

  const prompt = `You are maintaining a persistent markdown wiki.\n\nReturn ONLY JSON matching the provided output schema. No markdown fences, no commentary.\n\nTitle: ${title}\nModel hint: ${model || DEFAULT_MODEL}\n\nSource:\n${sourceText}`;

  try {
    const result = spawnSync(
      CODEX_COMMAND,
      ['exec', '--sandbox', 'read-only', '--ephemeral', '--output-schema', schemaPath, '--output-last-message', outputPath, '-'],
      { cwd: REPO_ROOT, input: prompt, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );

    if (result.error) {
      return { analysis: null, warning: `Codex execution failed: ${result.error.message}` };
    }
    if (result.status !== 0) {
      const stderr = String(result.stderr || result.stdout || '').trim();
      return { analysis: null, warning: stderr || `Codex exited with status ${result.status}` };
    }

    const candidates = [];
    try {
      candidates.push(await fs.readFile(outputPath, 'utf8'));
    } catch {}
    if (result.stdout) candidates.push(result.stdout);
    if (result.stderr) candidates.push(result.stderr);

    for (const text of candidates) {
      const parsed = safeJsonParse(text);
      if (parsed) return { analysis: normalizeAnalysis(parsed, title), warning: null };
    }

    return { analysis: null, warning: 'Codex completed but no parseable JSON output was found.' };
  } catch (error) {
    return { analysis: null, warning: error instanceof Error ? error.message : String(error) };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function runOpenAIAnalysis({ title, sourceText, model }) {
  const token = await getActiveOAuthRecord();
  if (!token?.access_token) return { analysis: null, warning: 'No OpenAI OAuth token available.' };

  const prompt = `You are maintaining a persistent markdown wiki.\n\nReturn ONLY valid JSON with this shape:\n{\n  "summary": string,\n  "key_claims": string[],\n  "entities": [{"name": string, "type": string, "note": string}],\n  "concepts": string[],\n  "topics": string[],\n  "contradictions": string[]\n}\n\nRules:\n- Keep claims factual and concise.\n- Use empty arrays when nothing is relevant.\n- Do not include markdown fences.\n- Do not invent details.\n\nTitle: ${title}\n\nSource:\n${sourceText}`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, input: prompt }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { analysis: null, warning: `OpenAI request failed (${response.status}): ${text}` };
  }

  const data = await response.json();
  const parsedFromOutputText = typeof data.output_text === 'string' ? safeJsonParse(data.output_text) : null;
  if (parsedFromOutputText) return { analysis: normalizeAnalysis(parsedFromOutputText, title), warning: null };

  const outputs = Array.isArray(data.output) ? data.output : [];
  for (const item of outputs) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') {
        const tryParsed = safeJsonParse(part.text);
        if (tryParsed) return { analysis: normalizeAnalysis(tryParsed, title), warning: null };
      }
    }
  }

  return { analysis: null, warning: 'OpenAI response did not contain parseable JSON.' };
}

export function chooseBackend(preferred, { codexAvailable, openaiAvailable }) {
  const mode = (preferred || 'auto').toLowerCase();
  if (mode === 'codex') return 'codex';
  if (mode === 'openai') return 'openai';
  if (mode === 'heuristic') return 'heuristic';
  if (codexAvailable) return 'codex';
  if (openaiAvailable) return 'openai';
  return 'heuristic';
}

export async function analyzeSource({ title, sourceText, backend, model }) {
  const codexAvailable = await commandAvailable(CODEX_COMMAND);
  const openaiAvailable = !!(await readOAuthRecord());
  const resolvedBackend = chooseBackend(backend, { codexAvailable, openaiAvailable });

  if (resolvedBackend === 'codex') {
    const result = await runCodexAnalysis({ title, sourceText, model });
    if (result.analysis) return { backend: 'codex', analysis: result.analysis, warning: result.warning };
    return { backend: 'heuristic', analysis: heuristicAnalysis(title, sourceText), warning: result.warning || 'Codex analysis unavailable; used heuristic fallback.' };
  }

  if (resolvedBackend === 'openai') {
    const result = await runOpenAIAnalysis({ title, sourceText, model });
    if (result.analysis) return { backend: 'openai', analysis: result.analysis, warning: result.warning };
    return { backend: 'heuristic', analysis: heuristicAnalysis(title, sourceText), warning: result.warning || 'OpenAI analysis unavailable; used heuristic fallback.' };
  }

  return { backend: 'heuristic', analysis: heuristicAnalysis(title, sourceText), warning: null };
}
