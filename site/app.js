const nav = document.getElementById('nav');
const content = document.getElementById('content');
const pageTitle = document.getElementById('page-title');
const search = document.getElementById('search');

const state = {
  pages: [],
  current: 'wiki/about.md',
};

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
      const href = `#/${target.trim().replace(/^\/?/, '')}.md`;
      return `<a href="${href}">${escapeHtml(label || target.trim())}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(markdown) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const out = [];
  let listOpen = false;
  let quoteOpen = false;
  let codeOpen = false;

  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
  const closeQuote = () => { if (quoteOpen) { out.push('</blockquote>'); quoteOpen = false; } };
  const closeCode = () => { if (codeOpen) { out.push('</code></pre>'); codeOpen = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      closeList();
      closeQuote();
      if (codeOpen) { closeCode(); } else { out.push('<pre><code>'); codeOpen = true; }
      continue;
    }
    if (codeOpen) {
      out.push(escapeHtml(line));
      continue;
    }
    if (!line) { closeList(); closeQuote(); out.push('<p></p>'); continue; }
    if (line.startsWith('### ')) { closeList(); closeQuote(); out.push(`<h3>${renderInline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { closeList(); closeQuote(); out.push(`<h2>${renderInline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { closeList(); closeQuote(); out.push(`<h1>${renderInline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('> ')) { closeList(); if (!quoteOpen) { out.push('<blockquote>'); quoteOpen = true; } out.push(`<p>${renderInline(line.slice(2))}</p>`); continue; }
    if (line.startsWith('- ')) { closeQuote(); if (!listOpen) { out.push('<ul>'); listOpen = true; } out.push(`<li>${renderInline(line.slice(2))}</li>`); continue; }
    out.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  closeQuote();
  closeCode();
  return out.join('\n').replace(/<p><\/p>/g, '<p class="spacer"></p>');
}

function parseTitle(markdown, fallback) {
  const titleMatch = String(markdown).match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  const fmMatch = String(markdown).match(/^---\n[\s\S]*?\ntitle:\s*"?([^"\n]+)"?/m);
  if (fmMatch) return fmMatch[1].trim();
  return fallback;
}

async function loadPage(page) {
  const path = page.replace(/^\/?/, '');
  state.current = path;
  const response = await fetch(`./${path}`);
  if (!response.ok) {
    pageTitle.textContent = 'Not found';
    content.innerHTML = `<p>Could not load <code>${escapeHtml(path)}</code>.</p>`;
    return;
  }
  const markdown = await response.text();
  pageTitle.textContent = parseTitle(markdown, path);
  content.innerHTML = renderMarkdown(markdown);
}

function buildNav(filter = '') {
  const needle = filter.trim().toLowerCase();
  const items = state.pages.filter((page) => {
    if (!needle) return true;
    return page.path.toLowerCase().includes(needle) || page.title.toLowerCase().includes(needle) || page.text.toLowerCase().includes(needle);
  });
  nav.innerHTML = items.map((page) => {
    const active = page.path === state.current ? 'active' : '';
    return `<a class="${active}" href="#/${page.path}"><span>${escapeHtml(page.title)}</span><small>${escapeHtml(page.path)}</small></a>`;
  }).join('');
}

async function loadIndex() {
  const index = await fetch('./wiki/index.md').then((r) => r.text());
  const links = [...index.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
  const unique = [...new Set(['wiki/about.md', 'wiki/index.md', 'wiki/log.md', ...links.map((l) => `${l}.md`.replace(/^wiki\//, 'wiki/'))])];
  const pages = [];
  for (const path of unique) {
    try {
      const text = await fetch(`./${path}`).then((r) => r.text());
      pages.push({ path, title: parseTitle(text, path), text });
    } catch {
      // ignore missing pages
    }
  }
  state.pages = pages.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || 'wiki/about.md';
}

window.addEventListener('hashchange', async () => {
  await loadPage(resolveHash());
  buildNav(search.value);
});

search.addEventListener('input', () => buildNav(search.value));

(async function main() {
  await loadIndex();
  buildNav('');
  await loadPage(resolveHash());
  buildNav(search.value);
})();
