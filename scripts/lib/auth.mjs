import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { OAUTH_TOKEN_FILE } from './config.mjs';
import { exists, isoStamp, randomBase64Url, readJson, sha256Base64Url, writeJson } from './utils.mjs';

export async function readOAuthRecord() {
  if (process.env.OPENAI_OAUTH_TOKEN) {
    return { access_token: process.env.OPENAI_OAUTH_TOKEN, token_type: 'Bearer', source: 'env' };
  }
  if (!(await exists(OAUTH_TOKEN_FILE))) return null;
  const record = await readJson(OAUTH_TOKEN_FILE);
  if (!record?.access_token) return null;
  return { ...record, source: 'file' };
}

export async function saveOAuthRecord(record) {
  await writeJson(OAUTH_TOKEN_FILE, {
    token_type: record.token_type || 'Bearer',
    access_token: record.access_token,
    refresh_token: record.refresh_token || null,
    expires_at: record.expires_at || null,
    updated_at: isoStamp(),
  });
}

export async function clearOAuthRecord() {
  if (await exists(OAUTH_TOKEN_FILE)) await fs.unlink(OAUTH_TOKEN_FILE);
}

export async function refreshOAuthRecord(record, tokenUrl = 'https://auth.openai.com/oauth/token', clientId = '') {
  if (!record?.refresh_token) return record;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: record.refresh_token,
  });
  if (clientId) body.set('client_id', clientId);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OAuth refresh failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : record.expires_at || null;
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || record.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_at: expiresAt,
  };
  await saveOAuthRecord(updated);
  return updated;
}

export async function getActiveOAuthRecord({ tokenUrl = 'https://auth.openai.com/oauth/token', clientId = '' } = {}) {
  const record = await readOAuthRecord();
  if (!record) return null;
  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now() - 30_000 && record.refresh_token) {
    return refreshOAuthRecord(record, tokenUrl, clientId);
  }
  return record;
}

export async function authStatus() {
  const token = await getActiveOAuthRecord();
  if (token) {
    console.log(JSON.stringify({ configured: true, source: token.source, path: OAUTH_TOKEN_FILE, expires_at: token.expires_at || null }, null, 2));
  } else {
    console.log(JSON.stringify({ configured: false, path: OAUTH_TOKEN_FILE }, null, 2));
  }
}

export async function authSetToken(token) {
  if (!token) throw new Error('--token is required');
  await saveOAuthRecord({ access_token: token, token_type: 'Bearer' });
  console.log(`Saved OpenAI OAuth bearer token to ${OAUTH_TOKEN_FILE}`);
}

export async function authImport(filePath) {
  if (!filePath) throw new Error('--file is required');
  const raw = await fs.readFile(path.resolve(filePath), 'utf8');
  const data = JSON.parse(raw);
  if (typeof data === 'string') {
    await saveOAuthRecord({ access_token: data, token_type: 'Bearer' });
  } else {
    await saveOAuthRecord(data);
  }
  console.log(`Imported OpenAI OAuth token from ${filePath}`);
}

export async function authLogin({
  clientId = '',
  authorizeUrl = 'https://auth.openai.com/oauth/authorize',
  tokenUrl = 'https://auth.openai.com/oauth/token',
  redirectUri = '',
  scope = 'openid profile email offline_access',
  audience = '',
  port = '43112',
} = {}) {
  const listenHost = '127.0.0.1';
  const listenPort = Number(port || 43112);
  const resolvedRedirectUri = redirectUri || `http://${listenHost}:${listenPort}/callback`;
  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const challenge = sha256Base64Url(verifier);
  const authUrl = new URL(authorizeUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', resolvedRedirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (audience) authUrl.searchParams.set('audience', audience);

  const result = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', resolvedRedirectUri);
        if (requestUrl.pathname !== new URL(resolvedRedirectUri).pathname) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const incomingState = requestUrl.searchParams.get('state');
        const code = requestUrl.searchParams.get('code');
        const error = requestUrl.searchParams.get('error');
        if (error) throw new Error(`OAuth authorization failed: ${error}`);
        if (incomingState !== state) throw new Error('STATE_NOT_FOUND');
        if (!code) throw new Error('Missing authorization code');

        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          redirect_uri: resolvedRedirectUri,
          code_verifier: verifier,
        });
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!tokenResponse.ok) {
          const text = await tokenResponse.text().catch(() => '');
          throw new Error(`OAuth token exchange failed (${tokenResponse.status}): ${text}`);
        }
        const tokenData = await tokenResponse.json();
        const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null;
        await saveOAuthRecord({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          token_type: tokenData.token_type || 'Bearer',
          expires_at: expiresAt,
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Login complete. You can close this tab.');
        server.close(() => resolve({ ok: true, tokenData }));
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(error instanceof Error ? error.message : String(error));
        server.close(() => reject(error));
      }
    });

    server.listen(listenPort, listenHost, () => {
      console.log(`Open this URL in a browser to continue OAuth login:\n${authUrl.toString()}`);
      console.log(`Waiting for callback on ${resolvedRedirectUri} ...`);
    });

    setTimeout(() => {
      server.close(() => reject(new Error('OAuth login timed out')));
    }, 5 * 60 * 1000).unref();
  });

  return result;
}
