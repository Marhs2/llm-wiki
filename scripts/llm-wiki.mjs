#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const DEFAULT_VAULT = path.resolve('vault');
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
const OAUTH_TOKEN_FILE = path.join(os.homedir(), '.config', 'llm-wiki', 'openai-oauth.json');
const CODEX_COMMAND = process.env.LLM_WIKI_CODEX_COMMAND || 'codex';
const REPO_ROOT = path.resolve('.');

function usage() {
  console.log(`
LLM Wiki CLI

Usage:
  node scripts/llm-wiki.mjs init [--vault PATH]
  node scripts/llm-wiki.mjs auth status
  node scripts/llm-wiki.mjs auth login [--client-id ID] [--authorize-url URL] [--token-url URL] [--redirect-uri URL] [--scope SCOPE] [--audience AUD] [--port PORT]
  node scripts/llm-wiki.mjs auth set-token --token TOKEN
  node scripts/llm-wiki.mjs auth import --file TOKEN_JSON
  node scripts/llm-wiki.mjs auth clear
  node scripts/llm-wiki.mjs ingest --source PATH [--title TITLE] [--kind KIND] [--vault PATH] [--model MODEL] [--backend BACKEND]
  node scripts/llm-wiki.mjs search --query TEXT [--vault PATH] [--limit N]
  node scripts/llm-wiki.mjs lint [--vault PATH]
  node scripts/llm-wiki.mjs status [--vault PATH]
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'untitled';
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isoStamp() {
  return new Date().toISOString();
}

function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Base64Url(text) {
  return crypto.createHash('sha256').update(text).digest('base64url');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function yamlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  return String(value);
}

function frontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${yamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function excerpt(text, maxLines = 10) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return 'No extract available.';
  return lines.slice(0, maxLines).join('\n');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeList(values) {
  return [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
}

function sourceLinkFromPath(rawDest, wikiFilePath) {
  return path.relative(path.dirname(wikiFilePath), rawDest).replace(/\\/g, '/');
}

function buildIndexPage() {
  return `${frontmatter({ title: 'LLM Wiki Index', type: 'index', created: isoDate() })}# LLM Wiki Index\n\n## Sources\n\n## Entities\n\n## Topics\n`;
}

function buildLogPage() {
  return `${frontmatter({ title: 'LLM Wiki Log', type: 'log', created: isoDate() })}# LLM Wiki Log\n\n## [${isoDate()}] init | vault created\n- Created vault scaffold\n`;
}

function buildCodeXSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'key_claims', 'entities', 'topics', 'contradictions'],
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
      topics: { type: 'array', items: { type: 'string' } },
      contradictions: { type: 'array', items: { type: 'string' } },
    },
  };
}

async function initVault(vault) {
  const dirs = [
    vault,
    path.join(vault, 'raw', 'sources'),
    path.join(vault, 'raw', 'assets'),
    path.join(vault, 'wiki', 'entities'),
    path.join(vault, 'wiki', 'concepts'),
    path.join(vault, 'wiki', 'topics'),
    path.join(vault, 'wiki', 'sources'),
  ];
  for (const dir of dirs) await ensureDir(dir);

  const indexPath = path.join(vault, 'wiki', 'index.md');
  const logPath = path.join(vault, 'wiki', 'log.md');

  if (!(await exists(indexPath))) await fs.writeFile(indexPath, buildIndexPage(), 'utf8');
  if (!(await exists(logPath))) await fs.writeFile(logPath, buildLogPage(), 'utf8');

  console.log(`Initialized vault at ${vault}`);
}

function sourceWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'sources', `${slug}.md`);
}

function sourceRawPath(vault, slug, ext = '.md') {
  return path.join(vault, 'raw', 'sources', `${slug}${ext}`);
}

function entityWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'entities', `${slug}.md`);
}

function topicWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'topics', `${slug}.md`);
}

async function insertUnderHeading(filePath, heading, linesToAdd) {
  const content = await fs.readFile(filePath, 'utf8');
  const additions = normalizeList(linesToAdd);
  if (!additions.length) return;

  const headingMarker = `## ${heading}`;
  const headingIndex = content.indexOf(headingMarker);
  if (headingIndex === -1) {
    const block = `${content.trimEnd()}\n\n${headingMarker}\n${additions.join('\n')}\n`;
    await fs.writeFile(filePath, block, 'utf8');
    return;
  }

  const afterHeading = content.slice(headingIndex + headingMarker.length);
  const nextHeadingMatch = afterHeading.match(/\n##\s+/);
  const sectionEnd = nextHeadingMatch ? headingIndex + headingMarker.length + nextHeadingMatch.index : content.length;
  const section = content.slice(headingIndex, sectionEnd);

  const existingLines = new Set(
    section
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ')),
  );

  const merged = additions.filter((line) => !existingLines.has(line.trim()));
  if (!merged.length) return;

  const before = content.slice(0, sectionEnd).trimEnd();
  const after = content.slice(sectionEnd).trimStart();
  await fs.writeFile(filePath, `${before}\n${merged.join('\n')}\n${after}`, 'utf8');
}

function sanitizeJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(sanitizeJson(text));
  } catch {
    return null;
  }
}

function heuristicAnalysis(title, sourceText) {
  const titleWords = new Set(title.toLowerCase().split(/\s+/).filter(Boolean));
  const stopTopicWords = new Set(['sample', 'source', 'the', 'and', 'with', 'for', 'from', 'this', 'that', 'wiki']);
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
  const properNouns = [...new Set((plain.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,2}\b/g) || []))]
    .filter((name) => {
      const lower = name.toLowerCase();
      return name.length > 2 && !['The', 'This', 'And', 'It'].includes(name) && !titleWords.has(lower);
    });
  const topicSeeds = [...new Set([
    ...title.toLowerCase().split(/\s+/),
    ...(plain.toLowerCase().match(/\b(?:wiki|llm|openai|obsidian|research|product|design|tool|model|api|workflow|knowledge|note|agent|markdown|oauth|codex)\b/g) || []),
  ])]
    .map((s) => String(s).trim())
    .filter((s) => {
      const lower = s.toLowerCase();
      return lower && lower.length > 3 && !stopTopicWords.has(lower) && !titleWords.has(lower);
    });
  return {
    summary: sent[0] || `Source ingested for ${title}. No model backend was available, so this is a placeholder summary.`,
    key_claims: contentLines.slice(0, 3),
    entities: properNouns.slice(0, 8).map((name) => ({ name, type: 'entity', note: `Detected heuristically in ${title}.` })),
    topics: topicSeeds.slice(0, 6),
    contradictions: [],
  };
}

function normalizeAnalysis(raw, title) {
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
    topics: normalizeList(data.topics),
    contradictions: normalizeList(data.contradictions),
  };
}

async function readOAuthRecord() {
  if (process.env.OPENAI_OAUTH_TOKEN) {
    return { access_token: process.env.OPENAI_OAUTH_TOKEN, token_type: 'Bearer', source: 'env' };
  }
  if (!(await exists(OAUTH_TOKEN_FILE))) return null;
  const record = await readJson(OAUTH_TOKEN_FILE);
  if (!record?.access_token) return null;
  return { ...record, source: 'file' };
}

async function saveOAuthRecord(record) {
  await writeJson(OAUTH_TOKEN_FILE, {
    token_type: record.token_type || 'Bearer',
    access_token: record.access_token,
    refresh_token: record.refresh_token || null,
    expires_at: record.expires_at || null,
    updated_at: isoStamp(),
  });
}

async function clearOAuthRecord() {
  if (await exists(OAUTH_TOKEN_FILE)) await fs.unlink(OAUTH_TOKEN_FILE);
}

async function refreshOAuthRecord(record, tokenUrl = 'https://auth.openai.com/oauth/token', clientId = '') {
  if (!record?.refresh_token) return record;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: record.refresh_token,
  });
  if (clientId) body.set('client_id', clientId);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OAuth refresh failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : record.expires_at || null;
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || record.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_at: expiresAt,
  };
  await saveOAuthRecord(updated);
  return updated;
}

async function getActiveOAuthRecord({ tokenUrl = 'https://auth.openai.com/oauth/token', clientId = '' } = {}) {
  const record = await readOAuthRecord();
  if (!record) return null;
  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now() - 30_000 && record.refresh_token) {
    return refreshOAuthRecord(record, tokenUrl, clientId);
  }
  return record;
}

async function authStatus() {
  const token = await getActiveOAuthRecord();
  if (token) {
    console.log(JSON.stringify({ configured: true, source: token.source, path: OAUTH_TOKEN_FILE, expires_at: token.expires_at || null }, null, 2));
  } else {
    console.log(JSON.stringify({ configured: false, path: OAUTH_TOKEN_FILE }, null, 2));
  }
}

async function authSetToken(token) {
  if (!token) throw new Error('--token is required');
  await saveOAuthRecord({ access_token: token, token_type: 'Bearer' });
  console.log(`Saved OpenAI OAuth bearer token to ${OAUTH_TOKEN_FILE}`);
}

async function authImport(filePath) {
  if (!filePath) throw new Error('--file is required');
  const raw = await fs.readFile(path.resolve(filePath), 'utf8');
  const data = JSON.parse(raw);
  if (typeof data === 'string') {
    await saveOAuthRecord({ access_token: data, token_type: 'Bearer' });
  } else if (data?.access_token) {
    await saveOAuthRecord(data);
  } else {
    throw new Error('Token file must contain a string token or an object with access_token');
  }
  console.log(`Imported OpenAI OAuth token from ${filePath}`);
}

async function authLogin({ clientId, authorizeUrl, tokenUrl, redirectUri, scope, audience, port }) {
  const resolvedClientId = clientId || process.env.OPENAI_OAUTH_CLIENT_ID || '';
  if (!resolvedClientId) {
    throw new Error('Missing client ID. Pass --client-id or set OPENAI_OAUTH_CLIENT_ID.');
  }
  const resolvedAuthorizeUrl = authorizeUrl || 'https://auth.openai.com/oauth/authorize';
  const resolvedTokenUrl = tokenUrl || 'https://auth.openai.com/oauth/token';
  const resolvedRedirectUri = redirectUri || 'http://127.0.0.1:43112/callback';
  const resolvedScope = scope || 'openid offline_access profile email';
  const resolvedAudience = audience || '';
  const state = randomBase64Url(18);
  const verifier = randomBase64Url(48);
  const challenge = sha256Base64Url(verifier);

  const redirect = new URL(resolvedRedirectUri);
  const listenHost = redirect.hostname === 'localhost' ? '127.0.0.1' : redirect.hostname;
  const listenPort = port ? Number(port) : (redirect.port ? Number(redirect.port) : 43112);
  const callbackPath = redirect.pathname;

  const authUrl = new URL(resolvedAuthorizeUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', resolvedClientId);
  authUrl.searchParams.set('redirect_uri', resolvedRedirectUri);
  authUrl.searchParams.set('scope', resolvedScope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (resolvedAudience) authUrl.searchParams.set('audience', resolvedAudience);

  const result = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || `${listenHost}:${listenPort}`}`);
        if (reqUrl.pathname !== callbackPath) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');
        if (error) throw new Error(`OAuth error: ${error}`);
        if (!code) throw new Error('Missing authorization code');
        if (returnedState !== state) throw new Error('OAuth state mismatch');

        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: resolvedRedirectUri,
          client_id: resolvedClientId,
          code_verifier: verifier,
        });

        const tokenResponse = await fetch(resolvedTokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!tokenResponse.ok) {
          const text = await tokenResponse.text().catch(() => '');
          throw new Error(`OAuth token exchange failed (${tokenResponse.status}): ${text}`);
        }
        const tokenData = await tokenResponse.json();
        const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null;
        await saveOAuthRecord({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          token_type: tokenData.token_type || 'Bearer',
          expires_at: expiresAt,
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Login complete. You can close this tab.');
        server.close(() => resolve({ ok: true, tokenData }));
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(error instanceof Error ? error.message : String(error));
        server.close(() => reject(error));
      }
    });

    server.listen(listenPort, listenHost, () => {
      console.log(`Open this URL in a browser to continue OAuth login:\n${authUrl.toString()}`);
      console.log(`Waiting for callback on ${resolvedRedirectUri} ...`);
    });

    setTimeout(() => {
      server.close(() => reject(new Error('OAuth login timed out')));
    }, 5 * 60 * 1000).unref();
  });

  return result;
}

async function commandAvailable(command) {
  if (!command) return false;
  if (command.includes(path.sep)) return exists(command);
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  return probe.status === 0 || probe.status === 1;
}

async function runCodexAnalysis({ title, sourceText, model }) {
  if (!(await commandAvailable(CODEX_COMMAND))) {
    return { analysis: null, warning: `Codex command not found: ${CODEX_COMMAND}` };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-codex-'));
  const schemaPath = path.join(tempDir, 'output-schema.json');
  const outputPath = path.join(tempDir, 'last-message.txt');
  await writeJson(schemaPath, buildCodeXSchema());

  const prompt = `You are maintaining a persistent markdown wiki.

Return ONLY JSON matching the provided output schema. No markdown fences, no commentary.

Title: ${title}
Model hint: ${model || DEFAULT_MODEL}

Source:
${sourceText}`;

  try {
    const result = spawnSync(
      CODEX_COMMAND,
      [
        'exec',
        '--sandbox', 'read-only',
        '--ephemeral',
        '--output-schema', schemaPath,
        '--output-last-message', outputPath,
        '-',
      ],
      {
        cwd: REPO_ROOT,
        input: prompt,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const stderr = String(result.stderr || '').trim();
      throw new Error(stderr || `Codex exited with status ${result.status}`);
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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function runOpenAIAnalysis({ title, sourceText, model }) {
  const token = await getActiveOAuthRecord();
  if (!token?.access_token) return { analysis: null, warning: 'No OpenAI OAuth token available.' };

  const prompt = `You are maintaining a persistent markdown wiki.

Return ONLY valid JSON with this shape:
{
  "summary": string,
  "key_claims": string[],
  "entities": [{"name": string, "type": string, "note": string}],
  "topics": string[],
  "contradictions": string[]
}

Rules:
- Keep claims factual and concise.
- Use empty arrays when nothing is relevant.
- Do not include markdown fences.
- Do not invent details.

Title: ${title}

Source:
${sourceText}`;

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

function chooseBackend(preferred, { codexAvailable, openaiAvailable }) {
  const mode = (preferred || 'auto').toLowerCase();
  if (mode === 'codex') return 'codex';
  if (mode === 'openai') return 'openai';
  if (mode === 'heuristic') return 'heuristic';
  if (codexAvailable) return 'codex';
  if (openaiAvailable) return 'openai';
  return 'heuristic';
}

async function analyzeSource({ title, sourceText, backend, model }) {
  const codexAvailable = await commandAvailable(CODEX_COMMAND);
  const openaiAvailable = !!(await readOAuthRecord());
  const resolvedBackend = chooseBackend(backend, { codexAvailable, openaiAvailable });

  if (resolvedBackend === 'codex') {
    const result = await runCodexAnalysis({ title, sourceText, model });
    if (result.analysis) return { backend: 'codex', analysis: result.analysis, warning: result.warning };
    const heuristic = heuristicAnalysis(title, sourceText);
    return { backend: 'heuristic', analysis: heuristic, warning: result.warning || 'Codex analysis unavailable; used heuristic fallback.' };
  }

  if (resolvedBackend === 'openai') {
    const result = await runOpenAIAnalysis({ title, sourceText, model });
    if (result.analysis) return { backend: 'openai', analysis: result.analysis, warning: result.warning };
    const heuristic = heuristicAnalysis(title, sourceText);
    return { backend: 'heuristic', analysis: heuristic, warning: result.warning || 'OpenAI analysis unavailable; used heuristic fallback.' };
  }

  return { backend: 'heuristic', analysis: heuristicAnalysis(title, sourceText), warning: null };
}

async function upsertReferencePage({ filePath, title, type, sourceLinks, summary, bullets, kindLabel }) {
  const sourceSet = normalizeList(sourceLinks).map((s) => (s.startsWith('[[') ? s : `[[${s}]]`));
  const lines = [
    frontmatter({ title, type, updated: isoDate(), sources: sourceSet }),
    `# ${title}`,
    '',
    '## Summary',
    summary || 'TODO',
    '',
    `## ${kindLabel}`,
    ...(bullets.length ? bullets.map((line) => `- ${line}`) : ['- None yet.']),
    '',
    '## Sources',
    ...(sourceSet.length ? sourceSet.map((s) => `- ${s}`) : ['- None yet.']),
    '',
  ];
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
}

async function ingest(vault, { source, title, kind = 'source', model, backend }) {
  if (!source) throw new Error('--source is required');
  const sourcePath = path.resolve(source);
  const sourceText = await fs.readFile(sourcePath, 'utf8');
  const derivedTitle = title || path.basename(sourcePath, path.extname(sourcePath));
  const slug = slugify(derivedTitle);
  const stamp = isoDate();
  const rawExt = path.extname(sourcePath) || '.md';
  const rawDest = sourceRawPath(vault, `${stamp}-${slug}`, rawExt);
  const wikiDest = sourceWikiPath(vault, `${stamp}-${slug}`);

  await initVault(vault);
  await fs.copyFile(sourcePath, rawDest);

  const { backend: analysisBackend, analysis, warning } = await analyzeSource({
    title: derivedTitle,
    sourceText,
    backend,
    model,
  });
  const summary = analysis.summary || `Source ingested for ${derivedTitle}.`;
  const keyClaims = normalizeList(analysis.key_claims);
  const entities = Array.isArray(analysis.entities) ? analysis.entities : [];
  const topics = normalizeList(analysis.topics);
  const contradictions = normalizeList(analysis.contradictions);

  const sourcePage = [
    frontmatter({
      title: derivedTitle,
      type: 'source',
      kind,
      created: stamp,
      model: model || DEFAULT_MODEL,
      backend: analysisBackend,
      source: sourceLinkFromPath(rawDest, wikiDest),
    }),
    `# ${derivedTitle}`,
    '',
    '## Summary',
    summary || 'TODO: replace this placeholder with a generated synthesis.',
    '',
    '## Key claims',
    ...(keyClaims.length ? keyClaims.map((line) => `- ${line}`) : ['- None extracted.']),
    '',
    '## Entities',
    ...(entities.length ? entities.map((entry) => `- [[entities/${slugify(entry.name)}]]${entry.type ? ` (${entry.type})` : ''}${entry.note ? ` — ${entry.note}` : ''}`) : ['- None extracted.']),
    '',
    '## Topics',
    ...(topics.length ? topics.map((topic) => `- [[topics/${slugify(topic)}]]`) : ['- None extracted.']),
    '',
    '## Contradictions',
    ...(contradictions.length ? contradictions.map((line) => `- ${line}`) : ['- None noted.']),
    '',
    '## Source extract',
    '',
    `> ${excerpt(sourceText).replace(/\n/g, '\n> ')}`,
    '',
    '## Links',
    '- Related pages:',
    '',
  ].join('\n');
  await fs.writeFile(wikiDest, sourcePage, 'utf8');

  const sourceWikiLink = `[[sources/${stamp}-${slug}]]`;
  const indexPath = path.join(vault, 'wiki', 'index.md');
  const logPath = path.join(vault, 'wiki', 'log.md');
  await insertUnderHeading(indexPath, 'Sources', [`- ${sourceWikiLink} — ${kind} (${analysisBackend})`]);

  for (const entry of entities) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (!name) continue;
    const entitySlug = slugify(name);
    const entityPath = entityWikiPath(vault, entitySlug);
    const entityTitle = name;
    const entitySummary = typeof entry === 'object' && entry?.note ? entry.note : `Mentioned in ${derivedTitle}.`;
    const existingSources = [];
    if (await exists(entityPath)) {
      const current = await fs.readFile(entityPath, 'utf8');
      const matches = [...current.matchAll(/\[\[(sources\/[^\]]+)\]\]/g)].map((m) => m[1]);
      existingSources.push(...matches);
    }
    await upsertReferencePage({
      filePath: entityPath,
      title: entityTitle,
      type: 'entity',
      sourceLinks: normalizeList([...existingSources, `sources/${stamp}-${slug}`]),
      summary: entitySummary,
      bullets: [`Mentioned in ${sourceWikiLink}`],
      kindLabel: 'Mentions',
    });
    await insertUnderHeading(indexPath, 'Entities', [`- [[entities/${entitySlug}]]`]);
  }

  for (const topic of topics) {
    const topicSlug = slugify(topic);
    const topicPath = topicWikiPath(vault, topicSlug);
    const existingSources = [];
    if (await exists(topicPath)) {
      const current = await fs.readFile(topicPath, 'utf8');
      const matches = [...current.matchAll(/\[\[(sources\/[^\]]+)\]\]/g)].map((m) => m[1]);
      existingSources.push(...matches);
    }
    await upsertReferencePage({
      filePath: topicPath,
      title: topic,
      type: 'topic',
      sourceLinks: normalizeList([...existingSources, `sources/${stamp}-${slug}`]),
      summary: `Topic collected from ${derivedTitle}.`,
      bullets: [`Appears in ${sourceWikiLink}`],
      kindLabel: 'References',
    });
    await insertUnderHeading(indexPath, 'Topics', [`- [[topics/${topicSlug}]]`]);
  }

  const logEntry = `## [${stamp}] ingest | ${derivedTitle}\n- raw: ${path.relative(path.join(vault, 'wiki'), rawDest).replace(/\\/g, '/')}\n- wiki: ${path.relative(path.join(vault, 'wiki'), wikiDest).replace(/\\/g, '/')}\n- backend: ${analysisBackend}\n- model: ${model || DEFAULT_MODEL}\n${warning ? `- warning: ${warning}\n` : ''}`;
  await fs.appendFile(logPath, `\n${logEntry}`, 'utf8');

  console.log(`Ingested ${derivedTitle}`);
  console.log(`  backend: ${analysisBackend}`);
  console.log(`  raw    : ${rawDest}`);
  console.log(`  wiki   : ${wikiDest}`);
}

async function countMarkdownFiles(dir) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countMarkdownFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) count += 1;
  }
  return count;
}

async function collectMarkdownFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function extractWikiLinks(text) {
  const links = [];
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of String(text || '').matchAll(regex)) {
    links.push(match[1].trim());
  }
  return normalizeList(links);
}

function parseFrontmatterTitle(text) {
  const match = String(text || '').match(/^---\n[\s\S]*?\ntitle:\s*"?([^"\n]+)"?[\s\S]*?\n---/m);
  return match ? match[1].trim() : '';
}

async function searchVault(vault, query, limit = 10) {
  const files = await collectMarkdownFiles(path.join(vault, 'wiki'));
  const needle = String(query || '').trim().toLowerCase();
  const results = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const rel = path.relative(vault, file).replace(/\\/g, '/');
    const title = parseFrontmatterTitle(text);
    if (!needle || rel.toLowerCase().includes(needle) || title.toLowerCase().includes(needle)) {
      results.push({ file: rel, line: 1, excerpt: title ? `# ${title}` : path.basename(file) });
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const hay = line.toLowerCase();
      if (needle && hay.includes(needle)) {
        results.push({
          file: rel,
          line: index + 1,
          excerpt: line.trim().slice(0, 240),
        });
      }
    });
  }
  return results.slice(0, limit);
}

async function lintVault(vault) {
  const wikiRoot = path.join(vault, 'wiki');
  const files = await collectMarkdownFiles(wikiRoot);
  const pageFiles = files.filter((file) => !/\/index\.md$|\/log\.md$/.test(file));
  const pagesBySlug = new Map();
  const inbound = new Map();
  const brokenLinks = [];
  const duplicateSlugs = [];

  for (const file of pageFiles) {
    const slug = path.basename(file, '.md');
    const category = path.relative(wikiRoot, file).split(path.sep)[0];
    const key = `${category}:${slug}`;
    if (pagesBySlug.has(key)) duplicateSlugs.push(key);
    else pagesBySlug.set(key, file);
    inbound.set(file, inbound.get(file) || 0);
  }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const links = extractWikiLinks(text);
    for (const link of links) {
      const target = path.join(wikiRoot, `${link}.md`);
      if (await exists(target)) {
        inbound.set(target, (inbound.get(target) || 0) + 1);
      } else if (link !== 'index' && link !== 'log') {
        brokenLinks.push({ from: path.relative(vault, file).replace(/\\/g, '/'), link });
      }
    }
  }

  const orphans = [];
  for (const file of pageFiles) {
    const inboundCount = inbound.get(file) || 0;
    if (inboundCount === 0) {
      orphans.push(path.relative(vault, file).replace(/\\/g, '/'));
    }
  }

  return {
    pages: pageFiles.length,
    duplicateSlugs,
    brokenLinks,
    orphans,
  };
}

async function status(vault) {
  const rawDir = path.join(vault, 'raw', 'sources');
  const wikiDir = path.join(vault, 'wiki', 'sources');
  const rawSources = (await exists(rawDir)) ? await countMarkdownFiles(rawDir) : 0;
  const wikiSources = (await exists(wikiDir)) ? await countMarkdownFiles(wikiDir) : 0;
  const token = await readOAuthRecord();
  const codexAvailable = await commandAvailable(CODEX_COMMAND);
  console.log(JSON.stringify({
    vault,
    rawSources,
    wikiSources,
    backendPriority: ['codex', 'openai', 'heuristic'],
    codex: { command: CODEX_COMMAND, available: codexAvailable },
    auth: token ? { configured: true, source: token.source, expires_at: token.expires_at || null } : { configured: false },
    model: DEFAULT_MODEL,
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
const vault = path.resolve(args.vault || DEFAULT_VAULT);

try {
  if (!command || command === 'help' || args.help) {
    usage();
  } else if (command === 'init') {
    await initVault(vault);
  } else if (command === 'auth') {
    const sub = args._[1];
    if (sub === 'status') await authStatus();
    else if (sub === 'login') await authLogin({ clientId: args['client-id'], authorizeUrl: args['authorize-url'], tokenUrl: args['token-url'], redirectUri: args['redirect-uri'], scope: args.scope, audience: args.audience, port: args.port });
    else if (sub === 'set-token') await authSetToken(args.token);
    else if (sub === 'import') await authImport(args.file);
    else if (sub === 'clear') {
      await clearOAuthRecord();
      console.log(`Cleared ${OAUTH_TOKEN_FILE}`);
    } else {
      usage();
      process.exitCode = 1;
    }
  } else if (command === 'ingest') {
    await ingest(vault, { source: args.source, title: args.title, kind: args.kind, model: args.model, backend: args.backend });
  } else if (command === 'search') {
    const limit = Number(args.limit || 10);
    const results = await searchVault(vault, args.query || '', Number.isFinite(limit) && limit > 0 ? limit : 10);
    console.log(JSON.stringify({ query: args.query || '', results }, null, 2));
  } else if (command === 'lint') {
    const report = await lintVault(vault);
    console.log(JSON.stringify(report, null, 2));
    if (report.brokenLinks.length || report.orphans.length || report.duplicateSlugs.length) process.exitCode = 2;
  } else if (command === 'status') {
    await status(vault);
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
