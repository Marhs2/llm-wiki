import test from 'node:test';
import assert from 'node:assert/strict';
import { apiPathForPage, buildApiIndexPayload } from '../scripts/lib/api.mjs';

test('apiPathForPage maps wiki markdown paths to stable json endpoints', () => {
  assert.equal(apiPathForPage('wiki/about.md'), 'api/pages/about.json');
  assert.equal(apiPathForPage('wiki/index.md'), 'api/pages/index.json');
  assert.equal(apiPathForPage('wiki/sources/2026-04-06-llm-wiki-readme.md'), 'api/pages/sources--2026-04-06-llm-wiki-readme.json');
});

test('buildApiIndexPayload exposes summary stats and page endpoints', () => {
  const pages = [
    {
      path: 'wiki/index.md',
      title: 'Index',
      type: 'index',
      summary: 'Catalog page',
      updated: '2026-04-06',
      links: ['sources/a'],
      linkCount: 1,
      backlinks: [],
      backlinkCount: 0,
      hubScore: 1,
    },
    {
      path: 'wiki/sources/a.md',
      title: 'Source A',
      type: 'source',
      summary: 'A source',
      updated: '2026-04-06',
      links: [],
      linkCount: 0,
      backlinks: ['wiki/index.md'],
      backlinkCount: 1,
      hubScore: 1,
    },
  ];

  const payload = buildApiIndexPayload({ generatedAt: '2026-04-06T00:00:00Z', edgeCount: 1, pages });

  assert.equal(payload.generatedAt, '2026-04-06T00:00:00Z');
  assert.equal(payload.pageCount, 2);
  assert.equal(payload.edgeCount, 1);
  assert.deepEqual(payload.types, { index: 1, source: 1 });
  assert.equal(payload.pages[0].apiPath, 'api/pages/index.json');
  assert.equal(payload.pages[1].apiPath, 'api/pages/sources--a.json');
});
