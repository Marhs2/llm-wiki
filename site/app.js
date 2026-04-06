const nav = document.getElementById('nav');
const content = document.getElementById('content');
const pageTitle = document.getElementById('page-title');
const pageMeta = document.getElementById('page-meta');
const search = document.getElementById('search');
const filters = document.getElementById('filters');
const searchState = document.getElementById('search-state');
const resultsCount = document.getElementById('results-count');
const clearSearch = document.getElementById('clear-search');
const statPages = document.getElementById('stat-pages');
const statFiltered = document.getElementById('stat-filtered');
const pageDetails = document.getElementById('page-details');
const toc = document.getElementById('toc');
const relatedLinks = document.getElementById('related-links');
const heroTitle = document.getElementById('hero-title');
const heroDescription = document.getElementById('hero-description');

const FILTER_ORDER = ['all', 'source', 'entity', 'concept', 'topic', 'answer', 'index', 'log', 'about'];

const state = {
  pages: [],
  filteredPages: [],
  activeFilter: 'all',
  current: 'wiki/about.md',
};

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pagePathFromLink(target) {
  const cleaned = target.trim().replace(/^\/?/, '').replace(/\.md$/, '');
  if (!cleaned) return 'wiki/about.md';
  if (cleaned === 'index' || cleaned === 'log' || cleaned === 'about') {
    return `wiki/${cleaned}.md`;
  }
  if (cleaned.startsWith('wiki/')) return `${cleaned}.md`;
  return `wiki/${cleaned}.md`;
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
      const href = `#/${pagePathFromLink(target)}`;
      return `<a href="${href}">${escapeHtml(label || target.trim())}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
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
      if (codeOpen) closeCode();
      else { out.push('<pre><code>'); codeOpen = true; }
      continue;
    }
    if (codeOpen) {
      out.push(escapeHtml(line));
      continue;
    }
    if (!line) {
      closeList();
      closeQuote();
      out.push('<p></p>');
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      closeQuote();
      const title = line.slice(4);
      out.push(`<h3 id="${slugify(title)}">${renderInline(title)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      closeQuote();
      const title = line.slice(3);
      out.push(`<h2 id="${slugify(title)}">${renderInline(title)}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      closeList();
      closeQuote();
      const title = line.slice(2);
      out.push(`<h1 id="${slugify(title)}">${renderInline(title)}</h1>`);
      continue;
    }
    if (line.startsWith('> ')) {
      closeList();
      if (!quoteOpen) {
        out.push('<blockquote>');
        quoteOpen = true;
      }
      out.push(`<p>${renderInline(line.slice(2))}</p>`);
      continue;
    }
    if (line.startsWith('- ')) {
      closeQuote();
      if (!listOpen) {
        out.push('<ul>');
        listOpen = true;
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }
    out.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  closeQuote();
  closeCode();
  return out.join('\n').replace(/<p><\/p>/g, '<p class="spacer"></p>');
}

function inferTitle(markdown, fallback) {
  const titleMatch = String(markdown).match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  const fmMatch = String(markdown).match(/^---\n[\s\S]*?\ntitle:\s*"?([^"\n]+)"?/m);
  if (fmMatch) return fmMatch[1].trim();
  return fallback;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, needle) {
  if (!needle) return escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(needle)})`, 'ig');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function buildSnippet(page, needle) {
  const summary = page.summary || page.text || '';
  if (!needle) return summary.slice(0, 180);
  const lower = summary.toLowerCase();
  const index = lower.indexOf(needle.toLowerCase());
  if (index === -1) return summary.slice(0, 180);
  const start = Math.max(0, index - 48);
  const end = Math.min(summary.length, index + needle.length + 96);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < summary.length ? '…' : '';
  return `${prefix}${summary.slice(start, end)}${suffix}`;
}

function normalizePage(page) {
  return {
    ...page,
    type: page.type || 'page',
    summary: page.summary || '',
    text: page.text || '',
    headings: Array.isArray(page.headings) ? page.headings : [],
    updated: page.updated || '',
    links: Array.isArray(page.links) ? page.links : [],
    linkCount: Number(page.linkCount || 0),
  };
}

function sortedFilterTypes() {
  const counts = state.pages.reduce((acc, page) => {
    acc[page.type] = (acc[page.type] || 0) + 1;
    return acc;
  }, {});
  return FILTER_ORDER.filter((key) => key === 'all' || counts[key]).concat(
    Object.keys(counts).filter((key) => !FILTER_ORDER.includes(key)).sort()
  );
}

function renderFilters() {
  const counts = state.pages.reduce((acc, page) => {
    acc[page.type] = (acc[page.type] || 0) + 1;
    return acc;
  }, {});
  const total = state.pages.length;
  const chips = sortedFilterTypes().map((type) => {
    const label = type === 'all' ? 'all' : type;
    const count = type === 'all' ? total : counts[type] || 0;
    const active = state.activeFilter === type ? 'active' : '';
    return `<button type="button" class="filter-chip ${active}" data-filter="${escapeHtml(type)}">${escapeHtml(label)} · ${count}</button>`;
  }).join('');
  filters.innerHTML = chips;
  filters.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter || 'all';
      buildNav(search.value);
      renderFilters();
    });
  });
}

function updateHeroStats() {
  statPages.textContent = String(state.pages.length);
  statFiltered.textContent = String(state.filteredPages.length);
  heroTitle.textContent = `${state.filteredPages.length} visible page${state.filteredPages.length === 1 ? '' : 's'}`;
  heroDescription.textContent = state.activeFilter === 'all'
    ? 'Browse the full synced wiki, then narrow results with text search or page-type filters.'
    : `Filtered to ${state.activeFilter} pages. Combine the filter with text search for faster lookup.`;
}

function scorePage(page, needle) {
  if (!needle) return page.linkCount || 0;
  let score = 0;
  if (page.title.toLowerCase().includes(needle)) score += 12;
  if (page.path.toLowerCase().includes(needle)) score += 8;
  if (page.summary.toLowerCase().includes(needle)) score += 6;
  if (page.headings.some((heading) => heading.toLowerCase().includes(needle))) score += 4;
  if (page.text.toLowerCase().includes(needle)) score += 2;
  score += Math.min(page.linkCount || 0, 6);
  return score;
}

function buildNav(filter = '') {
  const needle = filter.trim().toLowerCase();
  const items = state.pages.filter((page) => {
    const matchesFilter = state.activeFilter === 'all' || page.type === state.activeFilter;
    if (!matchesFilter) return false;
    if (!needle) return true;
    return page.path.toLowerCase().includes(needle)
      || page.title.toLowerCase().includes(needle)
      || page.summary.toLowerCase().includes(needle)
      || page.text.toLowerCase().includes(needle)
      || page.headings.some((heading) => heading.toLowerCase().includes(needle));
  }).sort((a, b) => scorePage(b, needle) - scorePage(a, needle) || a.title.localeCompare(b.title));

  state.filteredPages = items;
  resultsCount.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`;
  searchState.textContent = needle
    ? `Searching for “${filter.trim()}”${state.activeFilter !== 'all' ? ` in ${state.activeFilter}` : ''}`
    : state.activeFilter === 'all'
      ? 'Showing all synced wiki pages.'
      : `Showing only ${state.activeFilter} pages.`;
  updateHeroStats();

  if (!items.length) {
    nav.innerHTML = '<div class="empty-state">No pages matched the current search/filter. Try broader keywords or switch filters.</div>';
    return;
  }

  nav.innerHTML = items.map((page) => {
    const active = page.path === state.current ? 'active' : '';
    const snippet = buildSnippet(page, needle);
    return `
      <a class="${active}" href="#/${page.path}">
        <div class="nav-head">
          <span class="nav-title">${highlight(page.title, needle)}</span>
          <span class="badge type-${escapeHtml(page.type)}">${escapeHtml(page.type)}</span>
        </div>
        <small>${highlight(page.path, needle)}</small>
        <div class="snippet">${highlight(snippet, needle)}</div>
      </a>
    `;
  }).join('');
}

function renderDetails(page) {
  const detailRows = [
    ['Type', page.type],
    ['Path', page.path],
    ['Updated', page.updated || 'n/a'],
    ['Headings', String(page.headings.length)],
    ['Outgoing links', String(page.linkCount || page.links.length || 0)],
  ];
  pageDetails.innerHTML = detailRows.map(([label, value]) => `
    <li>
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </li>
  `).join('');
}

function renderToc() {
  const headings = [...content.querySelectorAll('h2, h3')];
  if (!headings.length) {
    toc.innerHTML = '<div class="toc-empty">No secondary headings on this page.</div>';
  } else {
    toc.innerHTML = headings.map((heading) => `
      <a href="#${escapeHtml(heading.id)}" data-anchor="${escapeHtml(heading.id)}">${escapeHtml(heading.textContent || '')}</a>
    `).join('');
    toc.querySelectorAll('[data-anchor]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const target = document.getElementById(link.dataset.anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  const currentPage = state.pages.find((page) => page.path === state.current);
  const directLinks = (currentPage?.links || [])
    .filter((link) => link !== 'index' && link !== 'log')
    .map((link) => ({
      path: pagePathFromLink(link),
      label: link.replace(/^.*\//, '').replace(/-/g, ' '),
      score: 10,
    }));
  const inferredLinks = state.pages
    .filter((page) => page.path !== state.current)
    .map((page) => {
      const shared = page.links.filter((link) => (currentPage?.links || []).includes(link)).length;
      return {
        path: page.path,
        label: page.title,
        score: shared * 3 + Math.min(page.linkCount || 0, 4),
      };
    })
    .filter((page) => page.score > 0);
  const linkMap = new Map();
  for (const item of [...directLinks, ...inferredLinks]) {
    if (!linkMap.has(item.path) || linkMap.get(item.path).score < item.score) linkMap.set(item.path, item);
  }
  const links = [...linkMap.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 8);
  if (!links.length) {
    relatedLinks.innerHTML = '<div class="toc-empty">No related wiki links captured for this page.</div>';
  } else {
    relatedLinks.innerHTML = links.map((link) => `
      <a href="#/${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>
    `).join('');
  }
}

async function loadManifest() {
  const response = await fetch('./data/wiki-index.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load ./data/wiki-index.json');
  const payload = await response.json();
  state.pages = (payload.pages || []).map(normalizePage);
  renderFilters();
  updateHeroStats();
}

function resolveHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || 'wiki/about.md';
}

async function loadPage(pagePath) {
  const path = pagePath.replace(/^\/?/, '');
  state.current = path;

  const response = await fetch(`./${path}`, { cache: 'no-store' });
  if (!response.ok) {
    pageTitle.textContent = 'Not found';
    pageMeta.textContent = path;
    content.innerHTML = `<div class="empty-state">Could not load <code>${escapeHtml(path)}</code>.</div>`;
    pageDetails.innerHTML = '';
    toc.innerHTML = '';
    return;
  }

  const markdown = await response.text();
  const page = state.pages.find((entry) => entry.path === path) || normalizePage({ path, title: inferTitle(markdown, path), text: stripFrontmatter(markdown) });
  pageTitle.textContent = inferTitle(markdown, path);
  pageMeta.textContent = [page.type, page.updated, page.path].filter(Boolean).join(' · ');
  content.innerHTML = renderMarkdown(markdown);
  renderDetails(page);
  renderToc();
}

window.addEventListener('hashchange', async () => {
  await loadPage(resolveHash());
  buildNav(search.value);
});

search.addEventListener('input', () => buildNav(search.value));
clearSearch.addEventListener('click', () => {
  search.value = '';
  state.activeFilter = 'all';
  renderFilters();
  buildNav('');
});

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
    search.select();
  }
});

(async function main() {
  try {
    await loadManifest();
    buildNav('');
    await loadPage(resolveHash());
    buildNav(search.value);
  } catch (error) {
    resultsCount.textContent = 'Search unavailable';
    searchState.textContent = error instanceof Error ? error.message : String(error);
    nav.innerHTML = '<div class="empty-state">Search index is missing. Run <code>node scripts/llm-wiki.mjs build-site</code> first.</div>';
    content.innerHTML = '<div class="empty-state">The static wiki has not been built yet.</div>';
  }
})();
