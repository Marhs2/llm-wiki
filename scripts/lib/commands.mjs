import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_MODEL, DEFAULT_SITE_DIR, DEFAULT_VAULT, CODEX_COMMAND } from './config.mjs';
import {
  collectMarkdownFiles,
  commandAvailable,
  countMarkdownFiles,
  excerpt,
  exists,
  frontmatter,
  isoDate,
  isoStamp,
  normalizeList,
  runCommandOrThrow,
  slugify,
} from './utils.mjs';
import {
  extractHeadings,
  extractSectionLinks,
  extractSectionText,
  extractWikiLinks,
  firstNonEmptyParagraph,
  inferPageType,
  markdownToPlainText,
  parseFrontmatterTitle,
  parseFrontmatterValue,
  sourceLinkFromPath,
  stripFrontmatter,
} from './markdown.mjs';
import {
  answerWikiPath,
  buildAboutPage,
  conceptWikiPath,
  entityWikiPath,
  initVault,
  insertUnderHeading,
  sourceRawPath,
  sourceWikiPath,
  topicWikiPath,
  upsertReferencePage,
} from './vault.mjs';
import { analyzeSource } from './analysis.mjs';
import { authImport, authLogin, authSetToken, authStatus, clearOAuthRecord, readOAuthRecord } from './auth.mjs';
import { buildGraphMetrics, summarizeGraph } from './graph.mjs';

export function usage() {
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
  node scripts/llm-wiki.mjs query --question TEXT [--vault PATH] [--limit N] [--write]
  node scripts/llm-wiki.mjs search --query TEXT [--vault PATH] [--limit N]
  node scripts/llm-wiki.mjs graph [--vault PATH] [--limit N]
  node scripts/llm-wiki.mjs lint [--vault PATH]
  node scripts/llm-wiki.mjs repair [--vault PATH] [--dry-run]
  node scripts/llm-wiki.mjs build-site [--vault PATH] [--site PATH]
  node scripts/llm-wiki.mjs deploy [--vault PATH] [--site PATH] [--project NAME] [--domain DOMAIN] [--prod] [--yes]
  node scripts/llm-wiki.mjs status [--vault PATH]
`);
}

export function parseArgs(argv) {
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

function compactText(text, maxLength = 160) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getPageSummary(text) {
  return compactText(extractSectionText(text, 'Summary') || firstNonEmptyParagraph(text) || markdownToPlainText(text), 180);
}

function getPageCatalogLine(link, text, fallback = '', metadata = '') {
  const summary = getPageSummary(text);
  const suffix = [summary || fallback, metadata].filter(Boolean).join(' · ');
  return suffix ? `- [[${link}]] — ${suffix}` : `- [[${link}]]`;
}

function extractBulletSection(text, heading) {
  const section = extractSectionText(text, heading);
  if (!section) return [];
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function buildSynthesis(question, pages) {
  const summaries = pages.map((page) => `- [[${page.path.replace(/\.md$/, '')}]] — ${page.summary || '요약 없음.'}`);
  const claims = [...new Set(pages.flatMap((page) => page.keyClaims || []).filter(Boolean))].slice(0, 8);
  const concepts = [...new Set(pages.flatMap((page) => page.concepts || []).filter(Boolean))].slice(0, 8);
  const contradictions = [...new Set(pages.flatMap((page) => page.contradictions || []).filter(Boolean).filter((line) => !/^none noted\.?$/i.test(line)))].slice(0, 5);
  const questionLower = question.toLowerCase();
  const hasLayerQuestion = questionLower.includes('layer') || questionLower.includes('구조');
  const hasWorkflowQuestion = questionLower.includes('workflow') || questionLower.includes('ingest') || questionLower.includes('query') || questionLower.includes('lint') || questionLower.includes('운영');

  const lines = [
    `질문: ${question}`,
    '',
    `이 답변은 ${pages.length}개의 위키 페이지를 바탕으로 생성되었습니다.`,
    '',
    '## Short answer',
  ];

  if (hasLayerQuestion) {
    lines.push('- 핵심 계층은 raw sources(불변 원문), the wiki(LLM이 유지하는 markdown 지식층), 그리고 schema/AGENTS.md 같은 운영 규칙 문서다.');
  } else if (hasWorkflowQuestion) {
    lines.push('- 운영 루프는 ingest로 source를 읽어 wiki를 갱신하고, query로 답변을 만들고, lint로 품질을 점검한 뒤, 유의미한 결과를 다시 wiki에 반영하는 구조다.');
  } else {
    lines.push(`- ${compactText(pages.map((page) => page.summary).filter(Boolean).join(' '), 240) || '관련 위키 페이지의 요약을 모아 synthesis를 구성했다.'}`);
  }

  lines.push('', '## Layers');
  lines.push('- Raw sources: 수정하지 않는 원문 저장소로서 source of truth 역할을 한다.');
  lines.push('- Wiki pages: source를 바탕으로 summary, entity, concept, topic, answer 페이지를 누적 관리한다.');
  lines.push('- Schema / agent rules: ingest, query, lint, linking 규칙을 정의해 일관된 유지보수를 가능하게 한다.');

  lines.push('', '## Workflows');
  lines.push('- Ingest: 새 source를 읽고 요약/핵심 주장/개념/토픽을 추출해 여러 wiki 페이지를 갱신한다.');
  lines.push('- Query: index와 관련 페이지를 읽어 답변을 만들고, 가치 있는 답은 answer 페이지로 다시 저장한다.');
  lines.push('- Lint: broken link, orphan, coverage 부족, 수상한 entity, underlinked concept를 점검한다.');

  if (claims.length) {
    lines.push('', '## Key points', ...claims.map((claim) => `- ${claim}`));
  }
  if (concepts.length) {
    lines.push('', '## Core concepts', ...concepts.map((concept) => `- ${concept}`));
  }
  if (contradictions.length) {
    lines.push('', '## Contradictions', ...contradictions.map((line) => `- ${line}`));
  } else {
    lines.push('', '## Contradictions', '- No explicit contradictions were recorded in the referenced pages.');
  }
  lines.push('', '## Evidence pages', ...summaries, '', '## Suggested follow-ups', ...pages.slice(0, 3).map((page) => `- Drill deeper into [[${page.path.replace(/\.md$/, '')}]] and strengthen linked entity/concept/topic pages.`));
  return lines.join('\n');
}

export async function ingest(vault, { source, title, kind = 'source', model, backend }) {
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

  const { backend: analysisBackend, analysis, warning } = await analyzeSource({ title: derivedTitle, sourceText, backend, model });
  const summary = analysis.summary || `Source ingested for ${derivedTitle}.`;
  const keyClaims = normalizeList(analysis.key_claims);
  const entities = Array.isArray(analysis.entities) ? analysis.entities : [];
  const concepts = normalizeList(analysis.concepts);
  const topics = normalizeList(analysis.topics);
  const contradictions = normalizeList(analysis.contradictions);

  const sourcePage = [
    frontmatter({ title: derivedTitle, type: 'source', kind, created: stamp, model: model || DEFAULT_MODEL, backend: analysisBackend, source: sourceLinkFromPath(rawDest, wikiDest) }),
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
    '## Concepts',
    ...(concepts.length ? concepts.map((concept) => `- [[concepts/${concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}]]`) : ['- None extracted.']),
    '',
    '## Topics',
    ...(topics.length ? topics.map((topic) => `- [[topics/${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}]]`) : ['- None extracted.']),
    '',
    '## Contradictions',
    ...(contradictions.length ? contradictions.map((line) => `- ${line}`) : ['- None noted.']),
    '',
    '## Source extract',
    '',
    `> ${excerpt(sourceText).replace(/\n/g, '\n> ')}`,
    '',
    '## Links',
    ...(entities.length ? entities.slice(0, 5).map((entry) => `- entity: [[entities/${slugify(entry.name)}]]`) : []),
    ...(concepts.length ? concepts.slice(0, 5).map((concept) => `- concept: [[concepts/${concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}]]`) : []),
    ...(topics.length ? topics.slice(0, 5).map((topic) => `- topic: [[topics/${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}]]`) : []),
    ...((entities.length || concepts.length || topics.length) ? [] : ['- Related pages: none yet.']),
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
    const entitySlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const entityPath = entityWikiPath(vault, entitySlug);
    const entitySummary = typeof entry === 'object' && entry?.note ? entry.note : `Mentioned in ${derivedTitle}.`;
    const existingSources = [];
    if (await exists(entityPath)) {
      const current = await fs.readFile(entityPath, 'utf8');
      const matches = [...current.matchAll(/\[\[(sources\/[^\]]+)\]\]/g)].map((m) => m[1]);
      existingSources.push(...matches);
    }
    await upsertReferencePage({ filePath: entityPath, title: name, type: 'entity', sourceLinks: normalizeList([...existingSources, `sources/${stamp}-${slug}`]), summary: entitySummary, bullets: [`Mentioned in ${sourceWikiLink}`], kindLabel: 'Mentions' });
    await insertUnderHeading(indexPath, 'Entities', [`- [[entities/${entitySlug}]]`]);
  }

  for (const concept of concepts) {
    const conceptSlug = concept.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const conceptPath = conceptWikiPath(vault, conceptSlug);
    const existingSources = [];
    if (await exists(conceptPath)) {
      const current = await fs.readFile(conceptPath, 'utf8');
      const matches = [...current.matchAll(/\[\[(sources\/[^\]]+)\]\]/g)].map((m) => m[1]);
      existingSources.push(...matches);
    }
    await upsertReferencePage({ filePath: conceptPath, title: concept, type: 'concept', sourceLinks: normalizeList([...existingSources, `sources/${stamp}-${slug}`]), summary: `Concept collected from ${derivedTitle}.`, bullets: [`Discussed in ${sourceWikiLink}`], kindLabel: 'References' });
    await insertUnderHeading(indexPath, 'Concepts', [`- [[concepts/${conceptSlug}]]`]);
  }

  for (const topic of topics) {
    const topicSlug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const topicPath = topicWikiPath(vault, topicSlug);
    const existingSources = [];
    if (await exists(topicPath)) {
      const current = await fs.readFile(topicPath, 'utf8');
      const matches = [...current.matchAll(/\[\[(sources\/[^\]]+)\]\]/g)].map((m) => m[1]);
      existingSources.push(...matches);
    }
    await upsertReferencePage({ filePath: topicPath, title: topic, type: 'topic', sourceLinks: normalizeList([...existingSources, `sources/${stamp}-${slug}`]), summary: `Topic collected from ${derivedTitle}.`, bullets: [`Appears in ${sourceWikiLink}`], kindLabel: 'References' });
    await insertUnderHeading(indexPath, 'Topics', [`- [[topics/${topicSlug}]]`]);
  }

  const logEntry = `## [${stamp}] ingest | ${derivedTitle}\n- raw: ${path.relative(path.join(vault, 'wiki'), rawDest).replace(/\\/g, '/')}\n- wiki: ${path.relative(path.join(vault, 'wiki'), wikiDest).replace(/\\/g, '/')}\n- backend: ${analysisBackend}\n- model: ${model || DEFAULT_MODEL}\n${warning ? `- warning: ${warning}\n` : ''}`;
  await fs.appendFile(logPath, `\n${logEntry}`, 'utf8');

  console.log(`Ingested ${derivedTitle}`);
  console.log(`  backend: ${analysisBackend}`);
  console.log(`  raw    : ${rawDest}`);
  console.log(`  wiki   : ${wikiDest}`);
}

export async function searchVault(vault, query, limit = 10) {
  const files = await collectMarkdownFiles(path.join(vault, 'wiki'));
  const needle = String(query || '').trim().toLowerCase();
  const terms = normalizeList(needle.split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1));
  const results = [];

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const rel = path.relative(vault, file).replace(/\\/g, '/');
    const title = parseFrontmatterTitle(text) || path.basename(file);
    const textLower = text.toLowerCase();
    const relLower = rel.toLowerCase();
    const titleLower = title.toLowerCase();

    const termScore = terms.reduce((score, term) => {
      let next = score;
      if (titleLower.includes(term)) next += 5;
      if (relLower.includes(term)) next += 3;
      if (textLower.includes(term)) next += 1;
      return next;
    }, 0);
    const exactScore = needle && (titleLower.includes(needle) || relLower.includes(needle) || textLower.includes(needle)) ? 8 : 0;
    const score = !needle ? 1 : termScore + exactScore;

    if (score > 0) {
      results.push({ file: rel, line: 1, excerpt: title ? `# ${title}` : path.basename(file), score });
    }

    if (!needle) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const hay = line.toLowerCase();
      const lineScore = terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), hay.includes(needle) ? 3 : 0);
      if (lineScore > 0) {
        results.push({ file: rel, line: index + 1, excerpt: line.trim().slice(0, 240), score: lineScore });
      }
    });
  }

  return results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.file.localeCompare(b.file) || a.line - b.line).slice(0, limit).map(({ score, ...result }) => result);
}

export async function queryWiki(vault, { question, limit = 6, write = false } = {}) {
  if (!question) throw new Error('--question is required');
  await initVault(vault);

  const indexText = await fs.readFile(path.join(vault, 'wiki', 'index.md'), 'utf8').catch(() => '');
  const searchResults = await searchVault(vault, question, Math.max(limit * 6, 20));
  const orderedMatches = [
    ...searchResults.filter((result) => result.file !== 'wiki/index.md' && result.file !== 'wiki/log.md'),
    ...(indexText ? [{ file: 'wiki/index.md' }] : []),
    { file: 'wiki/log.md' },
  ];
  const uniqueFiles = [...new Set(orderedMatches.map((result) => result.file))]
    .filter((rel) => !rel.startsWith('wiki/answers/'))
    .slice(0, limit);
  const pages = [];

  for (const rel of uniqueFiles) {
    const full = path.join(vault, rel);
    if (!(await exists(full))) continue;
    const text = await fs.readFile(full, 'utf8');
    pages.push({
      path: rel.replace(/^wiki\//, ''),
      title: parseFrontmatterTitle(text) || path.basename(full, '.md'),
      summary: getPageSummary(text),
      headings: extractHeadings(text),
      keyClaims: extractBulletSection(text, 'Key claims'),
      concepts: extractSectionLinks(text, 'Concepts').map((link) => link.replace(/^concepts\//, '')),
      contradictions: extractBulletSection(text, 'Contradictions'),
      architecture: extractSectionText(text, 'Architecture'),
      operations: extractSectionText(text, 'Operations'),
    });
  }

  const answerBody = pages.length
    ? buildSynthesis(question, pages)
    : [
        `질문: ${question}`,
        '',
        '관련 위키 페이지를 찾지 못했습니다. 먼저 새로운 source를 ingest 하거나 index/log를 점검하세요.',
      ].join('\n');

  let answerPage = null;
  if (write) {
    const stamp = isoDate();
    const slug = `${stamp}-${slugify(question).slice(0, 60)}`;
    const filePath = answerWikiPath(vault, slug);
    const sourceLinks = normalizeList(pages.map((page) => page.path.replace(/\.md$/, ''))).map((page) => `[[${page}]]`);
    const content = [
      frontmatter({ title: `Answer: ${question}`, type: 'answer', created: stamp, updated: stamp, sources: sourceLinks }),
      `# Answer: ${question}`,
      '',
      '## Summary',
      compactText(answerBody.split(/\n/).find((line) => line.startsWith('- '))?.slice(2) || answerBody, 180),
      '',
      '## Answer',
      answerBody,
      '',
      '## Sources',
      ...(sourceLinks.length ? sourceLinks.map((link) => `- ${link}`) : ['- None found.']),
      '',
    ].join('\n');
    await fs.writeFile(filePath, content, 'utf8');
    const indexPath = path.join(vault, 'wiki', 'index.md');
    const answerIndexLine = `- [[answers/${slug}]] — ${compactText(answerBody.split(/\n/).find((line) => line.startsWith('- '))?.slice(2) || question, 140)}`;
    const indexContent = await fs.readFile(indexPath, 'utf8');
    const cleanedIndex = indexContent.replace(new RegExp(`^- \\[[\\[]answers/${slug}\\]\\].*$\\n?`, 'gm'), '');
    await fs.writeFile(indexPath, cleanedIndex, 'utf8');
    await insertUnderHeading(indexPath, 'Answers', [answerIndexLine]);
    await fs.appendFile(path.join(vault, 'wiki', 'log.md'), `\n## [${stamp}] query | ${question}\n- answer: answers/${slug}.md\n- sources: ${pages.length}\n`, 'utf8');
    answerPage = path.relative(vault, filePath).replace(/\\/g, '/');
  }

  return { question, matches: pages.map((page) => ({ path: page.path, title: page.title, summary: page.summary })), answer: answerBody, answerPage };
}

export async function graphWiki(vault, { limit = 8 } = {}) {
  await initVault(vault);
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
      summary: getPageSummary(text),
      links,
      linkCount: links.length,
    });
  }

  const graph = buildGraphMetrics(pages);
  return {
    ...summarizeGraph(graph.pages, { limit: Number.isFinite(limit) && limit > 0 ? limit : 8 }),
    edgeCount: graph.edgeCount,
  };
}

export async function lintVault(vault) {
  const wikiRoot = path.join(vault, 'wiki');
  const files = await collectMarkdownFiles(wikiRoot);
  const pageFiles = files.filter((file) => !/\/index\.md$|\/log\.md$/.test(file));
  const pagesBySlug = new Map();
  const inbound = new Map();
  const brokenLinks = [];
  const duplicateSlugs = [];
  const missingSummaries = [];
  const thinSourceCoverage = [];
  const suspiciousEntities = [];
  const suggestedConcepts = [];

  for (const file of pageFiles) {
    const slug = path.basename(file, '.md');
    const category = path.relative(wikiRoot, file).split(path.sep)[0];
    const key = `${category}:${slug}`;
    if (pagesBySlug.has(key)) duplicateSlugs.push(key);
    else pagesBySlug.set(key, file);
    inbound.set(file, inbound.get(file) || 0);

    const text = await fs.readFile(file, 'utf8');
    const summary = getPageSummary(text);
    if (!summary) missingSummaries.push(path.relative(vault, file).replace(/\\/g, '/'));

    if (category === 'sources') {
      const entities = extractSectionLinks(text, 'Entities');
      const concepts = extractSectionLinks(text, 'Concepts');
      const topics = extractSectionLinks(text, 'Topics');
      if (entities.length + concepts.length + topics.length < 3) {
        thinSourceCoverage.push(path.relative(vault, file).replace(/\\/g, '/'));
      }
      const keyClaims = extractBulletSection(text, 'Key claims').join(' ').toLowerCase();
      const heuristicConcepts = [
        'persistent-wiki',
        'raw-sources',
        'source-of-truth',
        'synthesis',
        'cross-references',
        'compounding-artifact',
        'indexing-and-logging',
      ];
      for (const concept of heuristicConcepts) {
        const readable = concept.replace(/-/g, ' ');
        const hasMention = keyClaims.includes(readable) || summary.includes(readable);
        const hasPage = concepts.includes(`concepts/${concept}`);
        if (hasMention && !hasPage) {
          suggestedConcepts.push({ page: path.relative(vault, file).replace(/\\/g, '/'), concept });
        }
      }
    }

    if (category === 'entities') {
      const title = parseFrontmatterTitle(text) || slug;
      const looksLikeLegitAcronym = /^[A-Z0-9]{2,5}$/.test(title);
      if ((!looksLikeLegitAcronym && slug.length < 4) || /^(most|there|its|keep|write|read|fill|ask|use|set|auto|treat|update)$/i.test(slug)) {
        suspiciousEntities.push({ page: path.relative(vault, file).replace(/\\/g, '/'), title });
      }
    }
  }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const links = extractWikiLinks(text);
    for (const link of links) {
      const target = path.join(wikiRoot, `${link}.md`);
      if (await exists(target)) inbound.set(target, (inbound.get(target) || 0) + 1);
      else if (link !== 'index' && link !== 'log') brokenLinks.push({ from: path.relative(vault, file).replace(/\\/g, '/'), link });
    }
  }

  const orphans = [];
  for (const file of pageFiles) {
    if ((inbound.get(file) || 0) === 0) orphans.push(path.relative(vault, file).replace(/\\/g, '/'));
  }

  const underlinkedConcepts = [];
  for (const file of pageFiles.filter((entry) => /\/concepts\/[^/]+\.md$/.test(entry))) {
    const text = await fs.readFile(file, 'utf8');
    const relatedCount = extractSectionLinks(text, 'Related concepts').length;
    const sourceCount = extractSectionLinks(text, 'Sources').length;
    const effectiveReferences = (inbound.get(file) || 0) + relatedCount + sourceCount;
    if (effectiveReferences < 3) {
      underlinkedConcepts.push({
        concept: path.relative(vault, file).replace(/\\/g, '/').replace(/^wiki\//, '').replace(/\.md$/, ''),
        references: effectiveReferences,
      });
    }
  }

  return {
    pages: pageFiles.length,
    duplicateSlugs,
    brokenLinks,
    orphans,
    missingSummaries,
    thinSourceCoverage,
    suspiciousEntities,
    suggestedConcepts,
    underlinkedConcepts,
  };
}

export async function repairVault(vault, { dryRun = false } = {}) {
  await initVault(vault);
  const wikiRoot = path.join(vault, 'wiki');
  const files = await collectMarkdownFiles(wikiRoot);
  const sourceFiles = files.filter((file) => /\/sources\/[^/]+\.md$/.test(file));
  const entityFiles = files.filter((file) => /\/entities\/[^/]+\.md$/.test(file));
  const conceptFiles = files.filter((file) => /\/concepts\/[^/]+\.md$/.test(file));
  const topicFiles = files.filter((file) => /\/topics\/[^/]+\.md$/.test(file));
  const answerFiles = files.filter((file) => /\/answers\/[^/]+\.md$/.test(file));

  const entityRefs = new Map();
  const conceptRefs = new Map();
  const conceptRelations = new Map();
  const topicRefs = new Map();
  const sourceRows = [];
  const entityRows = [];
  const conceptRows = [];
  const topicRows = [];
  const answerRows = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file, 'utf8');
    const title = parseFrontmatterTitle(text) || path.basename(file, '.md');
    const kind = parseFrontmatterValue(text, 'kind') || 'source';
    const backend = parseFrontmatterValue(text, 'backend') || 'heuristic';
    const entities = extractSectionLinks(text, 'Entities').filter((link) => link.startsWith('entities/'));
    const concepts = extractSectionLinks(text, 'Concepts').filter((link) => link.startsWith('concepts/'));
    const topics = extractSectionLinks(text, 'Topics').filter((link) => link.startsWith('topics/'));
    sourceRows.push({ title, kind, backend, slug: path.basename(file, '.md'), text });
    for (const entityLink of entities) {
      if (!entityRefs.has(entityLink)) entityRefs.set(entityLink, new Set());
      entityRefs.get(entityLink).add(path.basename(file, '.md'));
    }
    for (const conceptLink of concepts) {
      if (!conceptRefs.has(conceptLink)) conceptRefs.set(conceptLink, new Set());
      conceptRefs.get(conceptLink).add(path.basename(file, '.md'));
      if (!conceptRelations.has(conceptLink)) conceptRelations.set(conceptLink, new Set());
      for (const relatedConcept of concepts) {
        if (relatedConcept !== conceptLink) conceptRelations.get(conceptLink).add(relatedConcept);
      }
    }
    for (const topicLink of topics) {
      if (!topicRefs.has(topicLink)) topicRefs.set(topicLink, new Set());
      topicRefs.get(topicLink).add(path.basename(file, '.md'));
    }
  }

  for (const file of entityFiles) {
    const text = await fs.readFile(file, 'utf8');
    entityRows.push({ slug: path.basename(file, '.md'), text });
  }

  for (const file of conceptFiles) {
    const text = await fs.readFile(file, 'utf8');
    conceptRows.push({ slug: path.basename(file, '.md'), text });
  }

  for (const file of topicFiles) {
    const text = await fs.readFile(file, 'utf8');
    topicRows.push({ slug: path.basename(file, '.md'), text });
  }

  for (const file of answerFiles) {
    const text = await fs.readFile(file, 'utf8');
    answerRows.push({ title: parseFrontmatterTitle(text) || path.basename(file, '.md'), slug: path.basename(file, '.md'), updated: parseFrontmatterValue(text, 'updated') || parseFrontmatterValue(text, 'created') || '', text });
  }

  const updates = [];

  const indexLines = [
    frontmatter({ title: 'LLM Wiki Index', type: 'index', created: isoDate() }),
    '# LLM Wiki Index',
    '',
    '## Sources',
    ...sourceRows.sort((a, b) => a.slug.localeCompare(b.slug)).map((row) => {
      const entityCount = extractSectionLinks(row.text, 'Entities').length;
      const conceptCount = extractSectionLinks(row.text, 'Concepts').length;
      const topicCount = extractSectionLinks(row.text, 'Topics').length;
      return getPageCatalogLine(`sources/${row.slug}`, row.text, `${row.kind} (${row.backend})`, `${entityCount} entities · ${conceptCount} concepts · ${topicCount} topics`);
    }),
    '',
    '## Entities',
    ...entityRows.sort((a, b) => a.slug.localeCompare(b.slug)).map((row) => getPageCatalogLine(`entities/${row.slug}`, row.text)),
    '',
    '## Concepts',
    ...conceptRows.sort((a, b) => a.slug.localeCompare(b.slug)).map((row) => getPageCatalogLine(`concepts/${row.slug}`, row.text)),
    '',
    '## Topics',
    ...topicRows.sort((a, b) => a.slug.localeCompare(b.slug)).map((row) => getPageCatalogLine(`topics/${row.slug}`, row.text)),
    '',
    '## Answers',
    ...answerRows.sort((a, b) => a.slug.localeCompare(b.slug)).map((row) => getPageCatalogLine(`answers/${row.slug}`, row.text, row.updated || 'answer')),
    '',
  ].join('\n');
  updates.push({ file: path.join(wikiRoot, 'index.md'), content: indexLines });

  const rebuildReferenceFiles = async (filesToBuild, refsMap, type, sectionHeading, bulletPrefix, extraBuilder = null) => {
    for (const file of filesToBuild) {
      const slug = path.basename(file, '.md');
      const text = await fs.readFile(file, 'utf8');
      const title = parseFrontmatterTitle(text) || slug;
      const refs = [...(refsMap.get(`${type}s/${slug}`) || new Set())].sort().map((sourceSlug) => `[[sources/${sourceSlug}]]`);
      const summary = extractSectionText(text, 'Summary') || 'TODO';
      const bullets = refs.length ? refs.map((ref) => `- ${bulletPrefix} ${ref}`).join('\n') : '- None yet.';
      const extraLines = extraBuilder ? extraBuilder({ slug, title, refs, text }) : [];
      const content = [
        frontmatter({ title, type, updated: isoDate(), sources: refs }),
        `# ${title}`,
        '',
        '## Summary',
        summary,
        '',
        `## ${sectionHeading}`,
        bullets,
        '',
        ...extraLines,
        '## Sources',
        ...(refs.length ? refs.map((ref) => `- ${ref}`) : ['- None yet.']),
        '',
      ].join('\n');
      updates.push({ file, content });
    }
  };

  await rebuildReferenceFiles(entityFiles, entityRefs, 'entity', 'Mentions', 'Mentioned in');
  await rebuildReferenceFiles(conceptFiles, conceptRefs, 'concept', 'References', 'Discussed in', ({ slug, refs }) => {
    const related = [...(conceptRelations.get(`concepts/${slug}`) || new Set())]
      .sort()
      .map((link) => `- [[${link}]]`);
    const sourceTopics = refs.length ? ['## Related concepts', ...(related.length ? related : ['- None yet.']), ''] : ['## Related concepts', ...(related.length ? related : ['- None yet.']), ''];
    return sourceTopics;
  });
  await rebuildReferenceFiles(topicFiles, topicRefs, 'topic', 'References', 'Appears in');

  const logPath = path.join(wikiRoot, 'log.md');
  const logEntry = `## [${isoStamp().slice(0, 10)}] repair | vault repaired\n- sources: ${sourceFiles.length}\n- entities: ${entityFiles.length}\n- concepts: ${conceptFiles.length}\n- topics: ${topicFiles.length}\n- answers: ${answerFiles.length}\n`;
  updates.push({ file: logPath, append: `\n${logEntry}` });

  if (!dryRun) {
    for (const update of updates) {
      if (update.append) await fs.appendFile(update.file, update.append, 'utf8');
      else await fs.writeFile(update.file, update.content, 'utf8');
    }
  }

  return { dryRun, sources: sourceFiles.length, entities: entityFiles.length, concepts: conceptFiles.length, topics: topicFiles.length, answers: answerFiles.length, filesPlanned: updates.length };
}

export async function buildSite(vault, { siteDir = DEFAULT_SITE_DIR } = {}) {
  await initVault(vault);
  const wikiRoot = path.join(vault, 'wiki');
  const targetWikiRoot = path.join(siteDir, 'wiki');
  const targetDataRoot = path.join(siteDir, 'data');
  await fs.mkdir(siteDir, { recursive: true });
  await fs.mkdir(targetDataRoot, { recursive: true });
  await fs.rm(targetWikiRoot, { recursive: true, force: true });
  await fs.cp(wikiRoot, targetWikiRoot, { recursive: true });
  await fs.writeFile(path.join(targetWikiRoot, 'about.md'), buildAboutPage(), 'utf8');

  const files = await collectMarkdownFiles(targetWikiRoot);
  const pages = [];
  for (const file of files) {
    const rel = path.relative(siteDir, file).replace(/\\/g, '/');
    const text = await fs.readFile(file, 'utf8');
    const summary = extractSectionText(text, 'Summary') || markdownToPlainText(text).slice(0, 220);
    const links = extractWikiLinks(text);
    pages.push({
      path: rel,
      title: parseFrontmatterTitle(text) || path.basename(file, '.md'),
      type: inferPageType(rel, text),
      summary: summary.replace(/\s+/g, ' ').trim(),
      headings: extractHeadings(text),
      updated: parseFrontmatterValue(text, 'updated') || parseFrontmatterValue(text, 'created') || '',
      text: markdownToPlainText(text),
      links,
      linkCount: links.length,
    });
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  const graph = buildGraphMetrics(pages);
  const graphSummary = summarizeGraph(graph.pages, { limit: 10 });
  const manifestPath = path.join(targetDataRoot, 'wiki-index.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({ generatedAt: isoStamp(), pageCount: graph.pages.length, edgeCount: graph.edgeCount, graphSummary, pages: graph.pages }, null, 2)}\n`, 'utf8');

  return { siteDir, wikiDir: targetWikiRoot, manifestPath, pageCount: graph.pages.length, edgeCount: graph.edgeCount };
}

export async function deploySite(vault, { siteDir = DEFAULT_SITE_DIR, project, domain, prod = false, yes = false } = {}) {
  const build = await buildSite(vault, { siteDir });
  const projectName = project || '';
  const projectFile = path.join(siteDir, '.vercel', 'project.json');

  if (projectName) {
    try {
      runCommandOrThrow('vercel', ['project', 'inspect', projectName], { cwd: siteDir });
    } catch {
      runCommandOrThrow('vercel', ['project', 'add', projectName], { cwd: siteDir });
    }
    runCommandOrThrow('vercel', ['link', '--yes', '--project', projectName], { cwd: siteDir });
  } else if (!(await exists(projectFile))) {
    runCommandOrThrow('vercel', ['link', '--yes'], { cwd: siteDir });
  }

  const deployArgs = ['deploy'];
  if (prod) deployArgs.push('--prod');
  if (yes) deployArgs.push('--yes');
  const deployResult = runCommandOrThrow('vercel', deployArgs, { cwd: siteDir });
  const output = `${deployResult.stdout || ''}\n${deployResult.stderr || ''}`.trim();
  const urls = [...output.matchAll(/https:\/\/[\w.-]+\.vercel\.app/g)].map((match) => match[0]);
  const deploymentUrl = urls[urls.length - 1] || '';

  let domainMessage = null;
  if (domain) {
    const resolvedProject = projectName || JSON.parse(await fs.readFile(projectFile, 'utf8')).projectName;
    runCommandOrThrow('vercel', ['domains', 'add', domain, resolvedProject], { cwd: siteDir });
    domainMessage = `Connected ${domain} to ${resolvedProject}`;
  }

  return { ...build, deploymentUrl, domainMessage };
}

export async function status(vault) {
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

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  const vault = path.resolve(args.vault || DEFAULT_VAULT);
  const siteDir = path.resolve(args.site || DEFAULT_SITE_DIR);

  if (!command || command === 'help' || args.help) {
    usage();
    return;
  }

  if (command === 'init') {
    await initVault(vault);
    return;
  }

  if (command === 'auth') {
    const sub = args._[1];
    if (sub === 'status') await authStatus();
    else if (sub === 'login') await authLogin({ clientId: args['client-id'], authorizeUrl: args['authorize-url'], tokenUrl: args['token-url'], redirectUri: args['redirect-uri'], scope: args.scope, audience: args.audience, port: args.port });
    else if (sub === 'set-token') await authSetToken(args.token);
    else if (sub === 'import') await authImport(args.file);
    else if (sub === 'clear') {
      await clearOAuthRecord();
      console.log('Cleared OpenAI OAuth token');
    } else {
      usage();
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'ingest') {
    await ingest(vault, { source: args.source, title: args.title, kind: args.kind, model: args.model, backend: args.backend });
    return;
  }

  if (command === 'query') {
    const limit = Number(args.limit || 6);
    const report = await queryWiki(vault, { question: args.question, limit: Number.isFinite(limit) && limit > 0 ? limit : 6, write: !!args.write });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'search') {
    const limit = Number(args.limit || 10);
    const results = await searchVault(vault, args.query || '', Number.isFinite(limit) && limit > 0 ? limit : 10);
    console.log(JSON.stringify({ query: args.query || '', results }, null, 2));
    return;
  }

  if (command === 'graph') {
    const limit = Number(args.limit || 8);
    const report = await graphWiki(vault, { limit: Number.isFinite(limit) && limit > 0 ? limit : 8 });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'lint') {
    const report = await lintVault(vault);
    console.log(JSON.stringify(report, null, 2));
    if (report.brokenLinks.length || report.orphans.length || report.duplicateSlugs.length) process.exitCode = 2;
    return;
  }

  if (command === 'repair') {
    const report = await repairVault(vault, { dryRun: !!args['dry-run'] });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'build-site') {
    const report = await buildSite(vault, { siteDir });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'deploy') {
    const report = await deploySite(vault, { siteDir, project: args.project, domain: args.domain, prod: !!args.prod, yes: !!args.yes });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'status') {
    await status(vault);
    return;
  }

  usage();
  process.exitCode = 1;
}
