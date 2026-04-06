# LLM Wiki Launch Roadmap

The current LLM Wiki project is evolving from a scaffold into a deployable public knowledge base.

## Goals

- Connect the wiki to a stable production domain.
- Fill the wiki with real source, entity, and topic pages rather than placeholder notes.
- Upgrade the public search UI so users can filter and preview results quickly.
- Automate static site generation and Vercel deployment.

## Implementation decisions

- The public site should be generated directly from `vault/wiki` so that the viewer always reflects the latest maintained markdown pages.
- Search should use a prebuilt JSON manifest containing path, title, summary, headings, page type, and full text.
- Deployment should run through a single command that syncs wiki content into `site/`, refreshes the search index, and pushes the result to Vercel.
- Custom domain attachment should be supported through the same deployment workflow when a domain is provided.

## Risks and follow-ups

- A real custom domain still requires ownership of a domain name and DNS configuration.
- Search quality depends on the quality of summaries and cross-links in generated wiki pages.
- Automation through GitHub Actions can be added later if repository secrets and project linkage are configured.
