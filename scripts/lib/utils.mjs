import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './config.mjs';

export function slugify(input) {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'untitled';
}

export function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isoStamp() {
  return new Date().toISOString();
}

export function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Base64Url(text) {
  return crypto.createHash('sha256').update(text).digest('base64url');
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function yamlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  return String(value);
}

export function frontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${yamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

export function excerpt(text, maxLines = 10) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return 'No extract available.';
  return lines.slice(0, maxLines).join('\n');
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function normalizeList(values) {
  return [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
}

export function sanitizeJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(sanitizeJson(text));
  } catch {
    return null;
  }
}

export async function countMarkdownFiles(dir) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countMarkdownFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) count += 1;
  }
  return count;
}

export async function collectMarkdownFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

export async function commandAvailable(command) {
  if (!command) return false;
  if (command.includes(path.sep)) return exists(command);
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  return probe.status === 0 || probe.status === 1;
}

export function runCommandOrThrow(command, commandArgs, { cwd = REPO_ROOT } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `${command} exited with status ${result.status}`).trim());
  }
  return result;
}
