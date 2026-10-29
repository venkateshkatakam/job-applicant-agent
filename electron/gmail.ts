import { app, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { convert } from 'html-to-text';
import { loadEncrypted, saveEncrypted } from './storage.js';
import { extractDocument, MAX_DOCUMENT_BYTES } from './documents.js';
import type { EmailQuery, EmailSource } from '../shared/types.js';
import { buildGmailQuery } from '../shared/search.js';

interface Credentials { clientId: string; clientSecret: string; projectId?: string }
interface Tokens { access_token: string; refresh_token?: string; expires_at: number }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage { id: string; internalDate?: string; payload?: GmailPart }
const scopes = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'];
let pendingAuthorization: AbortController | null = null;

export function authorizationFailureMessage(error: string | null): string {
  return error === 'access_denied'
    ? 'Google denied access. If the Google page says the app is being tested, open the OAuth client project > Google Auth Platform > Audience > Test users > Add users. Add and save the exact Gmail account you are signing in with, then retry. Publishing is not required for approved test users.'
    : 'Google sign-in did not complete. Check the error on the Google page and the Gmail setup guide, then try again.';
}

export function cancelAuthorization(): void {
  pendingAuthorization?.abort();
}

async function tokenRequest(parameters: Record<string, string>, signal?: AbortSignal): Promise<Tokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Google authorization failed. Check your Desktop OAuth configuration or reconnect Gmail.');
  const value = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!value.access_token) throw new Error('Google did not return an access token.');
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: Date.now() + value.expires_in * 1000 };
}

export async function storeCredentials(credentials: Credentials): Promise<void> {
  if (!credentials.clientId.endsWith('.apps.googleusercontent.com') || !credentials.clientSecret) throw new Error('Import a Google Desktop app OAuth credentials JSON file.');
  await saveEncrypted('oauth-client.enc', credentials);
}

export async function importClientConfiguration(input: unknown): Promise<string> {
  const parsed = z.object({ installed: z.object({ client_id: z.string().endsWith('.apps.googleusercontent.com'), client_secret: z.string().min(1), project_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).optional() }) }).safeParse(input);
  if (!parsed.success) throw new Error('Choose the JSON downloaded for a Google OAuth Desktop app client, not a Web client or service account.');
  const { client_id, client_secret, project_id } = parsed.data.installed;
  await storeCredentials({ clientId: client_id, clientSecret: client_secret, ...(project_id ? { projectId: project_id } : {}) });
  return client_id;
}

export async function configuredClientProject(): Promise<string> {
  const stored = await loadEncrypted<Credentials>('oauth-client.enc');
  return stored?.projectId ?? /^(\d+)-/.exec(stored?.clientId ?? '')?.[1] ?? '';
}

export async function configuredClientId(): Promise<string> {
  const stored = await loadEncrypted<Credentials>('oauth-client.enc');
  if (stored) return stored.clientId;
  const filename = app.isPackaged ? path.join(process.resourcesPath, 'google-oauth.json') : path.join(app.getAppPath(), 'resources', 'google-oauth.json');
  let contents: string;
  try { contents = await readFile(filename, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw new Error('Unable to read the app publisher Google sign-in configuration.'); }
  try { return await importClientConfiguration(JSON.parse(contents)); }
  catch { throw new Error('The app publisher Google sign-in configuration is invalid. Import a valid Desktop OAuth JSON to continue.'); }
}

export async function authorize(clientId: string): Promise<string> {
  const credentials = await loadEncrypted<Credentials>('oauth-client.enc');
  if (!credentials || credentials.clientId !== clientId) throw new Error('Import your Google Desktop OAuth JSON credentials first.');
  if (pendingAuthorization) throw new Error('Google sign-in is already in progress. Cancel it before retrying.');
  const controller = new AbortController();
  pendingAuthorization = controller;
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const server = createServer();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  let wroteTokens = false;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    controller.signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Cannot start the local OAuth callback.');
    const redirect = `http://127.0.0.1:${address.port}/oauth/callback`;
    const codePromise = new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(new Error('Google sign-in cancelled.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort);
      timer = setTimeout(() => reject(new Error('Gmail sign-in timed out. If Google shows Access blocked / Error 403, add the exact sign-in account in the OAuth client project > Google Auth Platform > Audience > Test users, save, then retry. Otherwise, start sign-in again.')), 180_000);
      server.on('request', (request, response) => {
        const url = new URL(request.url ?? '/', redirect);
        if (url.pathname !== '/oauth/callback') { response.writeHead(404).end(); return; }
        if (url.searchParams.get('state') !== state) { response.writeHead(400).end('Invalid authorization state.'); return; }
        const code = url.searchParams.get('code');
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(code ? 'Authorization received. Return to Job Applicant Agent to finish connecting.' : authorizationFailureMessage(url.searchParams.get('error')));
        if (code) resolve(code); else reject(new Error(authorizationFailureMessage(url.searchParams.get('error'))));
      });
    });
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    const [code] = await Promise.all([codePromise, shell.openExternal(authorization.toString())]);
    controller.signal.throwIfAborted();
    const tokens = await tokenRequest({ client_id: clientId, client_secret: credentials.clientSecret, redirect_uri: redirect, code, code_verifier: verifier, grant_type: 'authorization_code' }, controller.signal);
    controller.signal.throwIfAborted();
    await saveEncrypted('gmail-tokens.enc', tokens);
    wroteTokens = true;
    controller.signal.throwIfAborted();
    const profile = await gmailRequest<{ emailAddress: string }>('GET', '/profile', undefined, controller.signal);
    controller.signal.throwIfAborted();
    return profile.emailAddress;
  } catch (error) {
    if (controller.signal.aborted) {
      if (wroteTokens) await saveEncrypted('gmail-tokens.enc', null);
      throw new Error('Google sign-in cancelled.');
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener?.();
    server.close();
    if (pendingAuthorization === controller) pendingAuthorization = null;
  }
}

async function accessToken(): Promise<string> {
  let tokens = await loadEncrypted<Tokens>('gmail-tokens.enc');
  if (!tokens) throw new Error('Connect Gmail first.');
  if (tokens.expires_at < Date.now() + 60_000) {
    const credentials = await loadEncrypted<Credentials>('oauth-client.enc');
    if (!credentials || !tokens.refresh_token) throw new Error('Your Gmail session expired. Reconnect Gmail.');
    const renewed = await tokenRequest({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' });
    tokens = { ...renewed, refresh_token: renewed.refresh_token ?? tokens.refresh_token };
    await saveEncrypted('gmail-tokens.enc', tokens);
  }
  return tokens.access_token;
}

export async function gmailRequest<T>(method: 'GET' | 'POST', resource: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const allowedRead = /^\/(?:profile|messages(?:\?.*)?|messages\/[a-zA-Z0-9_-]+(?:\?format=full|\/attachments\/[a-zA-Z0-9_-]+)?)$/;
  if (!(method === 'GET' && allowedRead.test(resource)) && !(method === 'POST' && resource === '/drafts')) {
    throw new Error('Blocked Gmail operation: this application only reads mail and creates drafts.');
  }
  const token = await accessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${resource}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    if (method === 'POST' && response.status >= 500) throw new Error('Gmail returned an uncertain result. Check Gmail Drafts before retrying to avoid duplicates.');
    throw new Error(response.status === 401 ? 'Gmail authorization expired. Reconnect your account.' : response.status === 429 ? 'Gmail rate limit reached. Try again later.' : `Gmail request failed (${response.status}). Check account permissions and try again.`);
  }
  return await response.json() as T;
}

export async function disconnectGmail(): Promise<void> {
  const tokens = await loadEncrypted<Tokens>('gmail-tokens.enc');
  try {
    if (tokens) await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token ?? tokens.access_token }), signal: AbortSignal.timeout(10_000),
    });
  } finally { await saveEncrypted('gmail-tokens.enc', null); }
}

function flatten(part: GmailPart): GmailPart[] { return [part, ...(part.parts ?? []).flatMap(flatten)]; }
function header(part: GmailPart, name: string): string { return part.headers?.find(value => value.name.toLowerCase() === name.toLowerCase())?.value ?? ''; }

export async function readJobEmails(query: EmailQuery): Promise<{ documents: { text: string; source: string; emailSource: EmailSource }[]; errors: string[] }> {
  const search = buildGmailQuery(query);
  const documents: { text: string; source: string; emailSource: EmailSource }[] = [];
  const errors: string[] = [];
  let pageToken = '';
  let processed = 0;
  do {
    const parameters = new URLSearchParams({ q: search, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    const page = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>('GET', `/messages?${parameters}`);
    for (const reference of page.messages ?? []) {
      if (processed++ >= 200) break;
      try {
        const message = await gmailRequest<GmailMessage>('GET', `/messages/${reference.id}?format=full`);
        if (!message.payload) continue;
        const parts = flatten(message.payload);
        const texts = parts.filter(part => part.mimeType === 'text/plain' && !part.filename && part.body?.data).map(part => Buffer.from(part.body!.data!, 'base64url').toString('utf8'));
        if (!texts.length) {
          for (const part of parts.filter(part => part.mimeType === 'text/html' && part.body?.data)) {
            texts.push(convert(Buffer.from(part.body!.data!, 'base64url').toString('utf8'), { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] }));
          }
        }
        const subject = header(message.payload, 'subject');
        const received = new Date(message.internalDate ? Number(message.internalDate) : header(message.payload, 'date'));
        const emailSource: EmailSource = { messageId: message.id, subject, from: header(message.payload, 'from') || 'Sender unavailable', receivedAt: Number.isNaN(received.getTime()) ? null : received.toISOString() };
        if (texts.join('').trim()) documents.push({ text: `Subject: ${subject}\n${texts.join('\n')}`.slice(0, 200_000), source: `Gmail: ${subject}`, emailSource });
        for (const attachment of parts.filter(part => /\.(pdf|docx)$/i.test(part.filename ?? ''))) {
          try {
            if ((attachment.body?.size ?? 0) > MAX_DOCUMENT_BYTES) throw new Error('Attachment exceeds 10 MB.');
            const data = attachment.body?.data ?? (attachment.body?.attachmentId ? (await gmailRequest<{ data: string }>('GET', `/messages/${message.id}/attachments/${attachment.body.attachmentId}`)).data : '');
            const text = await extractDocument(attachment.filename!, Buffer.from(data, 'base64url'));
            documents.push({ text, source: `Gmail attachment: ${attachment.filename}`, emailSource: { ...emailSource, attachment: attachment.filename } });
          } catch (error) { errors.push(`${attachment.filename}: ${(error as Error).message}`); }
        }
      } catch (error) { errors.push(`Message ${reference.id}: ${(error as Error).message}`); }
    }
    pageToken = page.nextPageToken ?? '';
  } while (pageToken && processed < 200);
  if (pageToken) errors.push('Reached the 200-email limit. Narrow the date range to retrieve more.');
  return { documents, errors };
}