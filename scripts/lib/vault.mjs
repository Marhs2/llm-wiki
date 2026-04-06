import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, exists, frontmatter, isoDate, normalizeList } from './utils.mjs';

export function buildIndexPage() {
  return `${frontmatter({ title: 'LLM Wiki Index', type: 'index', created: isoDate() })}# LLM Wiki Index\n\n## Sources\n\n## Entities\n\n## Concepts\n\n## Topics\n\n## Answers\n`;
}

export function buildLogPage() {
  return `${frontmatter({ title: 'LLM Wiki Log', type: 'log', created: isoDate() })}# LLM Wiki Log\n\n## [${isoDate()}] init | vault created\n- Created vault scaffold\n`;
}

export function buildAboutPage() {
  return `${frontmatter({ title: 'LLM Wiki', type: 'about', updated: isoDate() })}# LLM Wiki\n\n이 페이지는 Codex 기반으로 유지되는 마크다운 위키의 퍼블릭 뷰입니다.\n\n## Highlights\n\n- 실제 \`vault/wiki/\` 내용을 정적 사이트로 동기화합니다.\n- 검색 인덱스와 필터 UI를 통해 source/entity/topic 페이지를 빠르게 탐색할 수 있습니다.\n- 배포 전 \`build-site\`가 wiki 파일과 검색 메타데이터를 함께 생성합니다.\n\n## Quick links\n\n- [[index]]\n- [[log]]\n\n## Workflow\n\n1. \`node scripts/llm-wiki.mjs ingest --source ...\` 로 자료를 수집합니다.\n2. \`node scripts/llm-wiki.mjs repair\` 로 인덱스/참조를 정리합니다.\n3. \`node scripts/llm-wiki.mjs build-site\` 로 site/wiki 와 검색 인덱스를 갱신합니다.\n4. \`node scripts/llm-wiki.mjs deploy --prod --yes\` 로 Vercel에 배포합니다.\n`;
}

export async function initVault(vault) {
  const dirs = [
    vault,
    path.join(vault, 'raw', 'sources'),
    path.join(vault, 'raw', 'assets'),
    path.join(vault, 'wiki', 'entities'),
    path.join(vault, 'wiki', 'concepts'),
    path.join(vault, 'wiki', 'topics'),
    path.join(vault, 'wiki', 'answers'),
    path.join(vault, 'wiki', 'sources'),
  ];
  for (const dir of dirs) await ensureDir(dir);

  const indexPath = path.join(vault, 'wiki', 'index.md');
  const logPath = path.join(vault, 'wiki', 'log.md');

  if (!(await exists(indexPath))) await fs.writeFile(indexPath, buildIndexPage(), 'utf8');
  if (!(await exists(logPath))) await fs.writeFile(logPath, buildLogPage(), 'utf8');

  console.log(`Initialized vault at ${vault}`);
}

export function sourceWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'sources', `${slug}.md`);
}

export function sourceRawPath(vault, slug, ext = '.md') {
  return path.join(vault, 'raw', 'sources', `${slug}${ext}`);
}

export function entityWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'entities', `${slug}.md`);
}

export function conceptWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'concepts', `${slug}.md`);
}

export function topicWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'topics', `${slug}.md`);
}

export function answerWikiPath(vault, slug) {
  return path.join(vault, 'wiki', 'answers', `${slug}.md`);
}

export async function insertUnderHeading(filePath, heading, linesToAdd) {
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

export async function upsertReferencePage({ filePath, title, type, sourceLinks, summary, bullets, kindLabel }) {
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
