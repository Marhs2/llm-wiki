import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphMetrics, summarizeGraph } from '../scripts/lib/graph.mjs';

test('buildGraphMetrics enriches pages with backlinks and hub scores', () => {
  const pages = [
    { path: 'wiki/index.md', title: 'Index', type: 'index', links: ['sources/a', 'concepts/x'], linkCount: 2 },
    { path: 'wiki/sources/a.md', title: 'Source A', type: 'source', links: ['concepts/x'], linkCount: 1 },
    { path: 'wiki/concepts/x.md', title: 'Concept X', type: 'concept', links: ['sources/a'], linkCount: 1 },
  ];

  const graph = buildGraphMetrics(pages);
  const index = graph.pages.find((page) => page.path === 'wiki/index.md');
  const source = graph.pages.find((page) => page.path === 'wiki/sources/a.md');
  const concept = graph.pages.find((page) => page.path === 'wiki/concepts/x.md');

  assert.deepEqual(index.backlinks, []);
  assert.deepEqual(source.backlinks, ['wiki/concepts/x.md', 'wiki/index.md']);
  assert.deepEqual(concept.backlinks, ['wiki/index.md', 'wiki/sources/a.md']);
  assert.equal(index.backlinkCount, 0);
  assert.equal(source.backlinkCount, 2);
  assert.equal(concept.backlinkCount, 2);
  assert.equal(index.hubScore, 2);
  assert.equal(source.hubScore, 3);
  assert.equal(concept.hubScore, 3);
  assert.equal(graph.edgeCount, 4);
});

test('summarizeGraph ranks hub pages and reports isolated pages', () => {
  const pages = [
    { path: 'wiki/index.md', title: 'Index', type: 'index', links: ['sources/a', 'topics/t'], linkCount: 2, backlinks: [], backlinkCount: 0, hubScore: 2 },
    { path: 'wiki/sources/a.md', title: 'Source A', type: 'source', links: ['topics/t'], linkCount: 1, backlinks: ['wiki/index.md'], backlinkCount: 1, hubScore: 2 },
    { path: 'wiki/topics/t.md', title: 'Topic T', type: 'topic', links: [], linkCount: 0, backlinks: ['wiki/index.md', 'wiki/sources/a.md'], backlinkCount: 2, hubScore: 2 },
    { path: 'wiki/answers/lonely.md', title: 'Lonely', type: 'answer', links: [], linkCount: 0, backlinks: [], backlinkCount: 0, hubScore: 0 },
  ];

  const summary = summarizeGraph(pages, { limit: 2 });

  assert.equal(summary.pageCount, 4);
  assert.equal(summary.connectedPages, 3);
  assert.equal(summary.isolatedPages.length, 1);
  assert.equal(summary.isolatedPages[0].path, 'wiki/answers/lonely.md');
  assert.deepEqual(summary.topHubPages.map((page) => page.path), ['wiki/index.md', 'wiki/sources/a.md']);
});
