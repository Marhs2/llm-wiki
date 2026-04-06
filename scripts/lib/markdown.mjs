import path from 'node:path';
import { normalizeList } from './utils.mjs';

export function sourceLinkFromPath(rawDest, wikiFilePath) {
  return path.relative(path.dirname(wikiFilePath), rawDest).replace(/\\/g, '/');
}

export function extractWikiLinks(text) {
  const links = [];
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of String(text || '').matchAll(regex)) {
    links.push(match[1].trim());
  }
  return normalizeList(links);
}

export function parseFrontmatterValue(text, key) {
  const body = String(text || '');
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return '';
  const line = fm[1].split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}:`));
  if (!line) return '';
  return line.replace(/^\s*[^:]+:\s*/, '').trim().replace(/^"|"$/g, '');
}

export function parseFrontmatterTitle(text) {
  return parseFrontmatterValue(text, 'title');
}

export function parseFrontmatterList(text, key) {
  const raw = parseFrontmatterValue(text, key);
  const matches = [...String(raw).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
  return normalizeList(matches);
}

export function extractSectionLinks(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break;
    const match = line.match(/\[\[([^\]]+)\]\]/);
    if (match) collected.push(match[1].trim());
  }
  return normalizeList(collected);
}

export function replaceFrontmatter(text, newFrontmatter) {
  const body = String(text || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  return `${newFrontmatter}${body.startsWith('\n') ? body.slice(1) : body}`;
}

export function stripFrontmatter(text) {
  return String(text || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
}

export function extractSectionText(text, heading) {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?:\\n## |$)`, 'm');
  const match = String(text || '').match(pattern);
  return match ? match[1].trim() : '';
}

export function extractHeadings(text) {
  return [...stripFrontmatter(text).matchAll(/^##?\s+(.+)$/gm)].map((match) => match[1].trim());
}

export function markdownToPlainText(text) {
  return stripFrontmatter(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstNonEmptyParagraph(text) {
  const body = stripFrontmatter(text);
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (blocks.find((block) => !block.startsWith('#') && !block.startsWith('##')) || blocks[0] || '').replace(/\s+/g, ' ').trim();
}

export function inferPageType(relPath, text) {
  const frontmatterType = parseFrontmatterValue(text, 'type');
  if (frontmatterType) return frontmatterType;
  if (relPath.endsWith('about.md')) return 'about';
  if (relPath.endsWith('index.md')) return 'index';
  if (relPath.endsWith('log.md')) return 'log';
  if (relPath.includes('/sources/')) return 'source';
  if (relPath.includes('/entities/')) return 'entity';
  if (relPath.includes('/concepts/')) return 'concept';
  if (relPath.includes('/topics/')) return 'topic';
  if (relPath.includes('/answers/')) return 'answer';
  return 'page';
}
