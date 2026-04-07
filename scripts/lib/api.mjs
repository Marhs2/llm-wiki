export function apiSlugForPage(pagePath) {
  return String(pagePath || '')
    .replace(/^wiki\//, '')
    .replace(/\.md$/, '')
    .replace(/[\/]+/g, '--') || 'page';
}

export function apiPathForPage(pagePath) {
  return `api/pages/${apiSlugForPage(pagePath)}.json`;
}

export function buildApiIndexPayload({ generatedAt, edgeCount = 0, pages = [] } = {}) {
  const types = pages.reduce((acc, page) => {
    const type = page.type || 'page';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: generatedAt || '',
    pageCount: pages.length,
    edgeCount,
    types,
    pages: pages.map((page) => ({
      path: page.path,
      title: page.title,
      type: page.type,
      summary: page.summary,
      updated: page.updated || '',
      apiPath: apiPathForPage(page.path),
      hubScore: Number(page.hubScore || 0),
      outgoingLinks: Number(page.linkCount || 0),
      incomingLinks: Number(page.backlinkCount || 0),
    })),
  };
}

export function buildPageApiPayload(page) {
  return {
    path: page.path,
    title: page.title,
    type: page.type,
    summary: page.summary || '',
    text: page.text || '',
    markdown: page.markdown || '',
    headings: Array.isArray(page.headings) ? page.headings : [],
    updated: page.updated || '',
    links: Array.isArray(page.links) ? page.links : [],
    backlinks: Array.isArray(page.backlinks) ? page.backlinks : [],
    linkCount: Number(page.linkCount || 0),
    backlinkCount: Number(page.backlinkCount || 0),
    hubScore: Number(page.hubScore || 0),
  };
}
