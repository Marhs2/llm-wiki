# LLM Wiki Automation Update

The LLM Wiki project now has a working GitHub + Vercel automation path.

## New state

- The codebase is published at `https://github.com/Marhs2/llm-wiki`.
- GitHub Actions now runs on pushes and pull requests.
- CI uses `package-lock.json` and `npm ci` so installs are reproducible.
- The Vercel project is linked to the GitHub repository and deploys from the `site/` root directory.
- The live site is available at `https://site-mu-puce.vercel.app`.

## Why this matters

- The wiki is no longer just a local prototype; it now has a durable public deployment path.
- Every push to `main` can refresh the public viewer.
- The project has working repository metadata, topics, and a public homepage.

## Implementation details

- `.github/workflows/ci-vercel.yml` runs tests, lints the wiki, and builds the static site.
- Vercel Git integration is connected directly to the GitHub repo.
- The workflow originally failed because the project had no lockfile; adding `package-lock.json` fixed setup-node caching.

## Follow-ups

- Create issues and pull request templates.
- Schedule ingest / repair / build automation.
- Consider a custom production domain beyond the Vercel alias.
