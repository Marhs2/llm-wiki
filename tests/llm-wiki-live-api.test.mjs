import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiArtifacts, resolveApiRequest, startLiveApiServer } from '../scripts/lib/live-api.mjs';

async function makeTempVault() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-live-api-'));
  const wikiDir = path.join(root, 'wiki');
  await fs.mkdir(wikiDir, { recursive: true });
  await fs.writeFile(path.join(wikiDir, 'index.md'), `---\ntitle: Index\ntype: index\ncreated: 2026-04-06\n---\n# Index\n\n## Summary\nCatalog page\n\n## Sources\n- [[sources/example]]\n`, 'utf8');
  await fs.mkdir(path.join(wikiDir, 'sources'), { recursive: true });
  await fs.writeFile(path.join(wikiDir, 'sources', 'example.md'), `---\ntitle: Example Source\ntype: source\ncreated: 2026-04-06\n---\n# Example Source\n\n## Summary\nExample summary\n`, 'utf8');
  return root;
}

test('buildApiArtifacts prepares index, graph, and page payloads', () => {
  const pages = [
    {
      path: 'wiki/index.md',
      title: 'Index',
      type: 'index',
      summary: 'Catalog',
      text: 'Index text',
      headings: ['Sources'],
      updated: '2026-04-06',
      links: ['sources/a'],
      linkCount: 1,
      backlinks: [],
      backlinkCount: 0,
      hubScore: 1,
    },
  ];
  const artifacts = buildApiArtifacts({
    generatedAt: '2026-04-06T00:00:00Z',
    edgeCount: 1,
    graphSummary: { pageCount: 1, connectedPages: 1, isolatedPages: [], topHubPages: [] },
    pages,
  });

  assert.equal(artifacts.index.pageCount, 1);
  assert.equal(artifacts.graph.edgeCount, 1);
  assert.ok(artifacts.pages.has('api/pages/index.json'));
});

test('resolveApiRequest returns payloads for known API routes and 404 for unknown routes', () => {
  const artifacts = buildApiArtifacts({
    generatedAt: '2026-04-06T00:00:00Z',
    edgeCount: 1,
    graphSummary: { pageCount: 1, connectedPages: 1, isolatedPages: [], topHubPages: [] },
    pages: [
      {
        path: 'wiki/index.md',
        title: 'Index',
        type: 'index',
        summary: 'Catalog',
        text: 'Index text',
        headings: ['Sources'],
        updated: '2026-04-06',
        links: ['sources/a'],
        linkCount: 1,
        backlinks: [],
        backlinkCount: 0,
        hubScore: 1,
      },
    ],
  });

  const indexResponse = resolveApiRequest('/api/index.json', artifacts);
  const graphResponse = resolveApiRequest('/api/graph.json', artifacts);
  const pageResponse = resolveApiRequest('/api/pages/index.json', artifacts);
  const missingResponse = resolveApiRequest('/api/pages/missing.json', artifacts);

  assert.equal(indexResponse.statusCode, 200);
  assert.equal(indexResponse.payload.pageCount, 1);
  assert.equal(graphResponse.statusCode, 200);
  assert.equal(graphResponse.payload.edgeCount, 1);
  assert.equal(pageResponse.statusCode, 200);
  assert.equal(pageResponse.payload.title, 'Index');
  assert.equal(missingResponse.statusCode, 404);
});

test('startLiveApiServer supports port 0 and serves live JSON endpoints', async () => {
  const vault = await makeTempVault();
  const { server, port } = await startLiveApiServer({ vault, host: '127.0.0.1', port: 0 });
  assert.ok(port > 0);

  try {
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootResponse.status, 200);
    const rootPayload = await rootResponse.json();
    assert.equal(rootPayload.mode, 'live');

    const indexResponse = await fetch(`http://127.0.0.1:${port}/api/index.json`);
    assert.equal(indexResponse.status, 200);
    const indexPayload = await indexResponse.json();
    assert.equal(indexPayload.pageCount, 2);
    assert.equal(indexPayload.pages[0].apiPath, 'api/pages/index.json');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(vault, { recursive: true, force: true });
  }
});

test('startLiveApiServer rejects when the requested port is already in use', async () => {
  const vault = await makeTempVault();
  const first = await startLiveApiServer({ vault, host: '127.0.0.1', port: 0 });
  const busyPort = first.port;

  try {
    await assert.rejects(
      () => startLiveApiServer({ vault, host: '127.0.0.1', port: busyPort }),
      /EADDRINUSE/
    );
  } finally {
    await new Promise((resolve) => first.server.close(resolve));
    await fs.rm(vault, { recursive: true, force: true });
  }
});
