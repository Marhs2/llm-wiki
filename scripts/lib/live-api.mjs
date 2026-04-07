import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { buildApiIndexPayload, buildPageApiPayload } from './api.mjs';
import { buildGraphMetrics, summarizeGraph } from './graph.mjs';
import { collectMarkdownFiles, isoStamp } from './utils.mjs';
import { extractHeadings, extractSectionText, extractWikiLinks, inferPageType, markdownToPlainText, parseFrontmatterTitle, parseFrontmatterValue } from './markdown.mjs';

export function buildApiArtifacts({ generatedAt, edgeCount = 0, graphSummary = {}, pages = [] } = {}) {
  const index = buildApiIndexPayload({ generatedAt, edgeCount, pages });
  const graph = { generatedAt, edgeCount, graphSummary };
  const pageMap = new Map();
  for (const page of pages) {
    pageMap.set(index.pages.find((entry) => entry.path === page.path)?.apiPath || '', buildPageApiPayload(page));
  }
  return { index, graph, pages: pageMap };
}

export function resolveApiRequest(urlPath, artifacts) {
  const pathname = String(urlPath || '').split('?')[0];
  if (pathname === '/api' || pathname === '/api/' || pathname === '/api/index.json') {
    return { statusCode: 200, payload: artifacts.index };
  }
  if (pathname === '/api/graph.json') {
    return { statusCode: 200, payload: artifacts.graph };
  }
  const pageKey = pathname.replace(/^\//, '');
  if (artifacts.pages.has(pageKey)) {
    return { statusCode: 200, payload: artifacts.pages.get(pageKey) };
  }
  return { statusCode: 404, payload: { error: 'Not found', path: pathname } };
}

export async function loadLiveApiArtifacts(vault) {
  const wikiRoot = path.join(vault, 'wiki');
  const files = await collectMarkdownFiles(wikiRoot);
  const pages = [];
  for (const file of files) {
    const rel = path.relative(vault, file).replace(/\\/g, '/');
    const text = await fs.readFile(file, 'utf8');
    const links = extractWikiLinks(text);
    pages.push({
      path: rel,
      title: parseFrontmatterTitle(text) || path.basename(file, '.md'),
      type: inferPageType(rel, text),
      summary: (extractSectionText(text, 'Summary') || markdownToPlainText(text).slice(0, 220)).replace(/\s+/g, ' ').trim(),
      markdown: text,
      text: markdownToPlainText(text),
      headings: extractHeadings(text),
      updated: parseFrontmatterValue(text, 'updated') || parseFrontmatterValue(text, 'created') || '',
      links,
      linkCount: links.length,
    });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  const graph = buildGraphMetrics(pages);
  const generatedAt = isoStamp();
  const graphSummary = summarizeGraph(graph.pages, { limit: 10 });
  return buildApiArtifacts({ generatedAt, edgeCount: graph.edgeCount, graphSummary, pages: graph.pages });
}

export function startLiveApiServer({ vault, port = 3030, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url || '/';
      if (url === '/' || url === '') {
        const body = JSON.stringify({
          ok: true,
          endpoints: ['/api/index.json', '/api/graph.json', '/api/pages/<slug>.json'],
          mode: 'live',
          source: vault,
        }, null, 2);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(`${body}\n`);
        return;
      }
      const artifacts = await loadLiveApiArtifacts(vault);
      const result = resolveApiRequest(url, artifacts);
      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(`${JSON.stringify(result.payload, null, 2)}\n`);
    } catch (error) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
    }
  });

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : port;
      const resolvedHost = typeof address === 'object' && address ? address.address : host;
      resolve({ server, port: resolvedPort, host: resolvedHost });
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}
