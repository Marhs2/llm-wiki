function normalizeTargetPath(target) {
  const cleaned = String(target || '').trim().replace(/^\/?/, '').replace(/\.md$/, '');
  if (!cleaned) return null;
  if (cleaned === 'index' || cleaned === 'log' || cleaned === 'about') return `wiki/${cleaned}.md`;
  if (cleaned.startsWith('wiki/')) return `${cleaned}.md`;
  return `wiki/${cleaned}.md`;
}

export function buildGraphMetrics(rawPages = []) {
  const pages = rawPages.map((page) => ({
    ...page,
    links: Array.isArray(page.links) ? [...page.links] : [],
    linkCount: Number(page.linkCount || (Array.isArray(page.links) ? page.links.length : 0)),
  }));
  const knownPaths = new Set(pages.map((page) => page.path));
  const backlinks = new Map(pages.map((page) => [page.path, new Set()]));
  let edgeCount = 0;

  for (const page of pages) {
    const resolvedTargets = [...new Set(page.links.map(normalizeTargetPath).filter(Boolean))]
      .filter((targetPath) => knownPaths.has(targetPath));
    for (const targetPath of resolvedTargets) {
      backlinks.get(targetPath)?.add(page.path);
      edgeCount += 1;
    }
  }

  const enrichedPages = pages.map((page) => {
    const inbound = [...(backlinks.get(page.path) || new Set())].sort();
    const backlinkCount = inbound.length;
    return {
      ...page,
      backlinks: inbound,
      backlinkCount,
      hubScore: (page.linkCount || 0) + backlinkCount,
    };
  });

  return { pages: enrichedPages, edgeCount };
}

export function summarizeGraph(rawPages = [], { limit = 8 } = {}) {
  const pages = rawPages.length && typeof rawPages[0]?.backlinkCount === 'number'
    ? rawPages
    : buildGraphMetrics(rawPages).pages;
  const isolatedPages = pages
    .filter((page) => (page.linkCount || 0) + (page.backlinkCount || 0) === 0)
    .sort((a, b) => a.path.localeCompare(b.path));
  const topHubPages = [...pages]
    .sort((a, b) => (b.hubScore || 0) - (a.hubScore || 0) || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((page) => ({
      path: page.path,
      title: page.title,
      type: page.type,
      hubScore: page.hubScore || 0,
      backlinks: page.backlinkCount || 0,
      outgoingLinks: page.linkCount || 0,
    }));

  return {
    pageCount: pages.length,
    connectedPages: pages.length - isolatedPages.length,
    isolatedPages: isolatedPages.map((page) => ({ path: page.path, title: page.title, type: page.type })),
    topHubPages,
  };
}
