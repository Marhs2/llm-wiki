import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, normalizeList, safeJsonParse } from '../scripts/lib/utils.mjs';
import { markdownToPlainText, parseFrontmatterTitle, extractSectionLinks } from '../scripts/lib/markdown.mjs';

test('slugify normalizes user-facing titles', () => {
  assert.equal(slugify('LLM Wiki Launch Roadmap'), 'llm-wiki-launch-roadmap');
});

test('normalizeList removes blanks and duplicates', () => {
  assert.deepEqual(normalizeList(['alpha', ' ', 'alpha', 'beta']), ['alpha', 'beta']);
});

test('safeJsonParse extracts json from fenced output', () => {
  assert.deepEqual(safeJsonParse('```json\n{"ok":true}\n```'), { ok: true });
});

test('parseFrontmatterTitle reads yaml title', () => {
  const doc = ['---', 'title: "Hello"', '---', '# Body'].join('\n');
  assert.equal(parseFrontmatterTitle(doc), 'Hello');
});

test('extractSectionLinks returns wiki links under a heading', () => {
  const doc = '# Test\n\n## Topics\n- [[topics/llm]]\n- [[topics/wiki]]\n\n## Other\n- [[topics/ignored]]';
  assert.deepEqual(extractSectionLinks(doc, 'Topics'), ['topics/llm', 'topics/wiki']);
});

test('markdownToPlainText removes markdown syntax while preserving text', () => {
  const doc = ['---', 'title: "Hello"', '---', '# Hello', '', '- [[topics/llm|LLM]]', '', '> quoted'].join('\n');
  assert.equal(markdownToPlainText(doc), 'Hello LLM quoted');
});
