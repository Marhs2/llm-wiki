import os from 'node:os';
import path from 'node:path';

export const DEFAULT_VAULT = path.resolve('vault');
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
export const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
export const OAUTH_TOKEN_FILE = path.join(os.homedir(), '.config', 'llm-wiki', 'openai-oauth.json');
export const CODEX_COMMAND = process.env.LLM_WIKI_CODEX_COMMAND || 'codex';
export const REPO_ROOT = path.resolve('.');
export const DEFAULT_SITE_DIR = path.resolve('site');
