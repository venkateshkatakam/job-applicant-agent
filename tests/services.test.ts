import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { shell } from 'electron';

const mock = vi.hoisted(() => ({ directory: '', available: true }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.directory, getAppPath: () => mock.directory, isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => mock.available,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (value: string) => Buffer.from(`test-encrypted:${Buffer.from(value).toString('base64')}`),
    decryptString: (value: Buffer) => Buffer.from(value.toString().replace('test-encrypted:', ''), 'base64').toString(),
  },
  shell: { openExternal: vi.fn() },
}));

import { extractDocument, MAX_DOCUMENT_BYTES } from '../electron/documents';
import { authorize, authorizationFailureMessage, cancelAuthorization, configuredClientId, configuredClientProject, gmailRequest, importClientConfiguration, readJobEmails } from '../electron/gmail';
import { loadEncrypted, saveEncrypted } from '../electron/storage';
import { extractJobs } from '../shared/engine';

beforeEach(async () => { mock.directory = await mkdtemp(path.join(tmpdir(), 'applicant-test-')); mock.available = true; vi.mocked(shell.openExternal).mockReset(); });
afterEach(async () => { cancelAuthorization(); vi.unstubAllGlobals(); await rm(mock.directory, { recursive: true, force: true }); });

describe('Google authorization cancellation and recovery', () => {
  const client = { installed: { client_id: 'test.apps.googleusercontent.com', client_secret: 'test-desktop' } };
  it('cancels the pending callback immediately and permits a fresh attempt', async () => {
    await importClientConfiguration(client);
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = authorize(client.installed.client_id).then(() => 'unexpected success', error => (error as Error).message);
      await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalledTimes(attempt + 1));
      cancelAuthorization();
      expect(await outcome).toBe('Google sign-in cancelled.');
    }
    expect(await loadEncrypted('gmail-tokens.enc')).toBeNull();
  });
  it('explains test-user approval for an access_denied callback', async () => {
    await importClientConfiguration(client);
    const outcome = authorize(client.installed.client_id).then(() => 'unexpected success', error => (error as Error).message);
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalledOnce());
    const opened = new URL(vi.mocked(shell.openExternal).mock.calls[0][0]);
    const callback = new URL(opened.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({ state: opened.searchParams.get('state')!, error: 'access_denied' }).toString();
    await fetch(callback);
    expect(await outcome).toBe(authorizationFailureMessage('access_denied'));
    expect(await outcome).toContain('Audience > Test users');
    expect(await loadEncrypted('gmail-tokens.enc')).toBeNull();
  });
  it('aborts an in-progress token exchange without retaining tokens', async () => {
    await importClientConfiguration(client);
    const realFetch = globalThis.fetch;
    const tokenFetch = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = options.signal!;
      if (signal.aborted) reject(new Error('aborted'));
      else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', tokenFetch);
    const outcome = authorize(client.installed.client_id).then(() => 'unexpected success', error => (error as Error).message);
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalledOnce());
    const opened = new URL(vi.mocked(shell.openExternal).mock.calls[0][0]);
    const callback = new URL(opened.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({ state: opened.searchParams.get('state')!, code: 'test-code' }).toString();
    await realFetch(callback);
    await vi.waitFor(() => expect(tokenFetch).toHaveBeenCalledOnce());
    cancelAuthorization();
    expect(await outcome).toBe('Google sign-in cancelled.');
    expect(await loadEncrypted('gmail-tokens.enc')).toBeNull();
  });
});

describe('document import', () => {
  it('extracts 33 separate jobs from a real 33-page PDF without cross-job skill leakage', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 33; index++) {
      const skills = index % 2 ? 'Salesforce SQL Java' : 'Selenium Playwright Katalon';
      pdf.addPage().drawText(`Job Title: QA Engineer ${index}\nCompany: Company ${index}\nLocation: Remote\nRequired Skills: ${skills}`, { x: 30, y: 700, font, size: 12, lineHeight: 20 });
    }
    const text = await extractDocument('33-jobs.pdf', Buffer.from(await pdf.save()));
    const jobs = extractJobs(text, '33-jobs.pdf', ['Selenium', 'Playwright', 'Katalon']);
    expect(jobs).toHaveLength(33);
    expect(jobs[0].skills).not.toContain('Playwright');
    expect(jobs[1].skills).toEqual(['Selenium', 'Playwright', 'Katalon']);
    expect(jobs[1].skills).not.toContain('Salesforce');
  });
  it('extracts text from a real PDF document', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('Job Title: Python Engineer. AWS. 5 years experience.', { x: 30, y: 700, font, size: 12 });
    expect(await extractDocument('job.pdf', Buffer.from(await pdf.save()))).toContain('Python Engineer');
  });
  it('extracts text from a real DOCX archive', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Senior React Engineer. TypeScript. 4 years experience.</w:t></w:r></w:p></w:body></w:document>');
    expect(await extractDocument('resume.docx', await zip.generateAsync({ type: 'nodebuffer' }))).toContain('Senior React Engineer');
  });
  it('rejects unsupported, oversized, and malformed documents', async () => {
    await expect(extractDocument('job.exe', Buffer.from('text'))).rejects.toThrow('PDF or DOCX');
    await expect(extractDocument('job.pdf', Buffer.alloc(MAX_DOCUMENT_BYTES + 1))).rejects.toThrow('10 MB');
    await expect(extractDocument('job.pdf', Buffer.from('not a PDF'))).rejects.toThrow();
  });
});

describe('credential storage boundary', () => {
  it('retains the imported project ID without exposing the client secret', async () => {
    await importClientConfiguration({ installed: { client_id: '123456789-test.apps.googleusercontent.com', client_secret: 'private-test', project_id: 'job-applicant-test' } });
    expect(await configuredClientProject()).toBe('job-applicant-test');
  });
  it('finds the project number in a legacy imported client when available', async () => {
    await importClientConfiguration({ installed: { client_id: '123456789-test.apps.googleusercontent.com', client_secret: 'private-test' } });
    expect(await configuredClientProject()).toBe('123456789');
  });
  it('accepts Desktop OAuth configuration and rejects web/service-account credentials', async () => {
    await expect(importClientConfiguration({ web: { client_id: 'web' } })).rejects.toThrow('Desktop app');
    await expect(importClientConfiguration({ installed: { client_id: 'client.apps.googleusercontent.com', client_secret: 'desktop-test' } })).resolves.toBe('client.apps.googleusercontent.com');
    expect(await configuredClientId()).toBe('client.apps.googleusercontent.com');
  });
  it('returns an unconfigured status when no publisher or imported client exists', async () => {
    expect(await configuredClientId()).toBe('');
  });
  it('round-trips through the OS encryption adapter, not plaintext JSON', async () => {
    await saveEncrypted('tokens.enc', { refresh_token: 'private-value' });
    expect((await readFile(path.join(mock.directory, 'tokens.enc'), 'utf8'))).not.toContain('private-value');
    expect(await loadEncrypted('tokens.enc')).toEqual({ refresh_token: 'private-value' });
  });
  it('fails closed when OS credential storage is unavailable', async () => {
    mock.available = false;
    await expect(saveEncrypted('tokens.enc', { secret: true })).rejects.toThrow('Secure OS credential storage');
  });
});

describe('Gmail draft-only transport', () => {
  it('blocks send and arbitrary API operations before accessing tokens or the network', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const resource of ['/messages/send', '/drafts/abc/send', '/settings/forwardingAddresses', '/drafts?send=true']) {
      await expect(gmailRequest('POST', resource)).rejects.toThrow('Blocked Gmail operation');
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows only the draft-creation POST endpoint', async () => {
    await saveEncrypted('gmail-tokens.enc', { access_token: 'test-token', expires_at: Date.now() + 300_000 });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'draft-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await gmailRequest('POST', '/drafts', { message: { raw: 'test' } })).toEqual({ id: 'draft-1' });
    expect(fetch.mock.calls[0][0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });
  it('extracts HTML email without rendering or fetching remote content', async () => {
    await saveEncrypted('gmail-tokens.enc', { access_token: 'test-token', expires_at: Date.now() + 300_000 });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'abc123' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'abc123', internalDate: String(Date.parse('2026-10-29T10:15:00Z')), payload: { mimeType: 'text/html', headers: [{ name: 'Subject', value: 'Python opportunity' }, { name: 'From', value: 'Recruiter <recruiter@example.com>' }], body: { data: Buffer.from('<p>Company: Acme</p><p>Python AWS engineer</p><img src="https://tracker.example/pixel"/>').toString('base64url') } } })));
    vi.stubGlobal('fetch', fetch);
    const result = await readJobEmails({ after: '2026-10-01', before: '2026-10-29', query: 'hiring' });
    expect(result.documents[0].text).toContain('Company: Acme');
    expect(result.documents[0].text).not.toContain('<p>');
    expect(result.documents[0].emailSource).toMatchObject({ messageId: 'abc123', subject: 'Python opportunity', from: 'Recruiter <recruiter@example.com>', receivedAt: '2026-10-29T10:15:00.000Z' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain('after');
  });
});