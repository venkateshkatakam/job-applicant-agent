import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildMime, draftFor, extractJobs, extractSkills, makeResume, mergeEmailSource, rankJob, reextractImportedJobs } from '../shared/engine.js';
import { isMatchingJob, removeJobsFromDocument, type ImportResult, type Job, type State } from '../shared/types.js';
import { extractDocument, MAX_DOCUMENT_BYTES } from './documents.js';
import { authorize, cancelAuthorization, configuredClientId, configuredClientProject, disconnectGmail, gmailRequest, importClientConfiguration, readJobEmails } from './gmail.js';
import { loadEncrypted, loadState, logEvent, saveEncrypted, saveState } from './storage.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(app.getAppPath(), 'resources/icon.png');
let window: BrowserWindow;
let queue = Promise.resolve<unknown>(undefined);
let drafting = false;
const identifier = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const preferencesSchema = z.object({
  locations: z.array(z.string().trim().min(1).max(100)).max(50), skills: z.array(z.string().trim().min(1).max(80)).max(100),
  minimumMatch: z.number().int().min(0).max(100), applicantName: z.string().trim().max(120), template: z.string().min(20).max(10000),
  skillMatchMode: z.enum(['any', 'all']).default('any'),
});
const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value), 'Use a valid date.');
const querySchema = z.object({ after: date, before: date, query: z.string().max(500), terms: z.array(z.string().trim().min(1).max(100).regex(/^[^"\\{}()\r\n]+$/)).max(30).default([]), matchMode: z.enum(['any', 'all']).default('any') }).refine(value => !value.after || !value.before || value.after <= value.before, 'Start date must be before end date.');

async function persist(state: State): Promise<State> {
  state.jobs = state.jobs.map(job => rankJob(job, state.resumes, state.preferences)).sort((left, right) => right.score - left.score);
  await saveState(state);
  return state;
}

function handle(channel: string, operation: (...args: unknown[]) => Promise<unknown>, serialized = true): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted caller.');
    const result = (serialized ? queue : Promise.resolve()).then(() => operation(...args)).catch(async (error: unknown) => {
      await logEvent('operation.failed', { operation: channel, kind: error instanceof z.ZodError ? 'validation' : 'runtime' });
      throw new Error(error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : error instanceof Error ? error.message : 'Operation failed.');
    });
    if (serialized) queue = result.catch(() => undefined);
    return result;
  });
}

async function importFiles(resumes: boolean): Promise<ImportResult> {
  const selection = await dialog.showOpenDialog(window, { title: resumes ? 'Import resumes' : 'Import job descriptions', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }] });
  const result: ImportResult = { added: 0, errors: [] };
  if (selection.canceled) return result;
  const state = await loadState();
  for (const filename of selection.filePaths.slice(0, 30)) {
    const name = path.basename(filename);
    try {
      if ((await stat(filename)).size > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds 10 MB.');
      const bytes = await readFile(filename);
      const text = await extractDocument(name, bytes);
      if (resumes) {
        const resume = makeResume(name, text, state.preferences.skills);
        await saveEncrypted(`resume-${resume.id}.enc`, { name, bytes: bytes.toString('base64') });
        state.resumes.push(resume);
        result.added++;
      } else {
        for (const job of extractJobs(text, name, state.preferences.skills)) {
          if (state.jobs.some(existing => existing.id === job.id)) continue;
          state.jobs.push(job);
          result.added++;
        }
      }
    } catch (error) { result.errors.push(`${name}: ${(error as Error).message}`); }
  }
  await persist(state);
  await logEvent(resumes ? 'resumes.imported' : 'jobs.imported', { added: result.added, failed: result.errors.length });
  return result;
}

function registerHandlers(): void {
  handle('state:load', async () => {
    const state = await loadState();
    state.oauthClientId = await configuredClientId();
    state.oauthProject = await configuredClientProject();
    state.resumes = state.resumes.map(resume => ({ ...resume, skills: extractSkills(resume.text, state.preferences.skills) }));
    state.jobs = state.jobs.map(job => rankJob(job, state.resumes, state.preferences)).sort((left, right) => right.score - left.score);
    return state;
  });
  handle('preferences:save', async input => {
    const state = await loadState();
    state.preferences = preferencesSchema.parse(input);
    return persist(state);
  });
  handle('resumes:import', () => importFiles(true));
  handle('jobs:import', () => importFiles(false));
  handle('jobs:reextract', async () => {
    const state = await loadState();
    const result = reextractImportedJobs(state.jobs, state.preferences.skills);
    state.jobs = result.jobs;
    await persist(state);
    await logEvent('jobs.reextracted', { added: result.added });
    return { added: result.added, errors: [] };
  });
  handle('resumes:remove', async input => {
    const id = identifier.parse(input);
    const state = await loadState();
    state.resumes = state.resumes.filter(resume => resume.id !== id);
    const { unlink } = await import('node:fs/promises');
    try { await unlink(path.join(app.getPath('userData'), `resume-${id}.enc`)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return persist(state);
  });
  handle('jobs:add', async input => {
    const text = z.string().trim().min(20).max(200_000).parse(input);
    const state = await loadState();
    for (const job of extractJobs(text, 'Pasted description', state.preferences.skills)) {
      if (!state.jobs.some(existing => existing.id === job.id)) state.jobs.push(job);
    }
    return persist(state);
  });
  handle('jobs:update', async (input, fields) => {
    const state = await loadState();
    const job = state.jobs.find(value => value.id === identifier.parse(input));
    if (!job) throw new Error('Job not found.');
    Object.assign(job, z.object({ title: z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/), company: z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/), location: z.string().trim().min(1).max(160), recipient: z.union([z.literal(''), z.string().email().max(254)]) }).parse(fields));
    return persist(state);
  });
  handle('jobs:delete', async input => {
    const state = await loadState();
    state.jobs = state.jobs.filter(job => job.id !== identifier.parse(input));
    return persist(state);
  });
  handle('jobs:remove-document', async input => {
    const source = z.string().min(1).max(500).parse(input);
    const state = await loadState();
    const before = state.jobs.length;
    state.jobs = removeJobsFromDocument(state.jobs, source);
    await persist(state);
    await logEvent('jobs.document-removed', { removed: before - state.jobs.length });
    return state;
  });
  handle('gmail:credentials', async () => {
    const selected = await dialog.showOpenDialog(window, { title: 'Import Google Desktop OAuth credentials', filters: [{ name: 'OAuth client JSON', extensions: ['json'] }], properties: ['openFile'] });
    const state = await loadState();
    if (selected.canceled) return null;
    if ((await stat(selected.filePaths[0])).size > 64_000) throw new Error('Invalid credentials file.');
    const json = JSON.parse(await readFile(selected.filePaths[0], 'utf8')) as unknown;
    if (state.connectedEmail) throw new Error('Disconnect Gmail before changing OAuth credentials.');
    state.oauthClientId = await importClientConfiguration(json);
    state.oauthProject = await configuredClientProject();
    await saveState(state);
    return state;
  });
  handle('gmail:connect', async input => {
    const state = await loadState();
    state.connectedEmail = await authorize(z.string().max(250).parse(input));
    await saveState(state);
    await logEvent('gmail.connected');
    return state;
  });
  handle('gmail:setup', async input => {
    const step = z.enum(['api', 'consent', 'credentials', 'audience']).parse(input);
    const urls = {
      api: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
      consent: 'https://console.cloud.google.com/auth/overview',
      credentials: 'https://console.cloud.google.com/auth/clients',
      audience: 'https://console.cloud.google.com/auth/audience',
    };
    const url = new URL(urls[step]);
    const project = await configuredClientProject();
    if (project) url.searchParams.set('project', project);
    await shell.openExternal(url.toString());
  });
  handle('gmail:cancel', async () => { cancelAuthorization(); }, false);
  handle('gmail:disconnect', async () => {
    const state = await loadState();
    try { await disconnectGmail(); } finally { state.connectedEmail = null; await saveState(state); }
    return state;
  });
  handle('gmail:fetch', async input => {
    const query = querySchema.parse(input);
    const state = await loadState();
    if (!state.connectedEmail) throw new Error('Connect Gmail first.');
    const fetched = await readJobEmails(query);
    let added = 0;
    const jobIds = new Set<string>();
    for (const document of fetched.documents) {
      for (const job of extractJobs(document.text, document.source, state.preferences.skills)) {
        jobIds.add(job.id);
        const index = state.jobs.findIndex(existing => existing.id === job.id);
        if (index >= 0) state.jobs[index] = mergeEmailSource(state.jobs[index], document.emailSource);
        else { state.jobs.push(mergeEmailSource(job, document.emailSource)); added++; }
      }
    }
    state.lastSync = new Date().toISOString();
    state.lastGmailSearch = { jobIds: [...jobIds], criteria: query, searchedAt: state.lastSync };
    await persist(state);
    await logEvent('gmail.imported', { added, failed: fetched.errors.length });
    return { added, errors: fetched.errors };
  });
  handle('draft:preview', async input => {
    const state = await loadState();
    const stored = state.jobs.find(value => value.id === identifier.parse(input));
    const job = stored ? rankJob(stored, state.resumes, state.preferences) : undefined;
    const resume = state.resumes.find(value => value.id === job?.resumeId);
    if (!job || !resume) throw new Error('Import a resume before previewing a draft.');
    return draftFor(job, resume, state.preferences);
  });
  handle('draft:create', async input => {
    if (drafting) throw new Error('A drafting batch is already running.');
    const ids = [...new Set(z.array(identifier).min(1).max(100).parse(input))];
    const state = await loadState();
    state.jobs = state.jobs.map(job => rankJob(job, state.resumes, state.preferences));
    if (!state.connectedEmail) throw new Error('Connect Gmail before creating drafts.');
    drafting = true;
    const result = { created: 0, failed: 0, skipped: 0 };
    try {
      for (const id of ids) {
        const job = state.jobs.find(value => value.id === id);
        if (!job || job.draftId || !isMatchingJob(job, state.preferences)) { result.skipped++; continue; }
        try {
          const resume = state.resumes.find(value => value.id === job.resumeId)!;
          const attachment = await loadEncrypted<{ name: string; bytes: string }>(`resume-${resume.id}.enc`);
          if (!attachment) throw new Error('Resume file is missing. Import it again.');
          const draft = draftFor(job, resume, state.preferences);
          const mime = buildMime(draft, { name: attachment.name, bytes: Buffer.from(attachment.bytes, 'base64') });
          const response = await gmailRequest<{ id: string }>('POST', '/drafts', { message: { raw: Buffer.from(mime).toString('base64url') } });
          if (!response.id) throw new Error('Gmail did not confirm the draft. Check Gmail before retrying.');
          job.draftId = response.id;
          job.draftResumeId = resume.id;
          job.draftStatus = 'ready';
          delete job.error;
          result.created++;
        } catch (error) {
          job.draftStatus = 'failed';
          job.error = (error as Error).message;
          result.failed++;
        }
        await saveState(state);
      }
      await logEvent('drafts.completed', result);
      if (Notification.isSupported()) new Notification({ title: 'Job Applicant Agent', body: `Ready to apply for ${result.created} ${result.created === 1 ? 'job' : 'jobs'}. ${result.failed ? `${result.failed} need attention. ` : ''}Review your Gmail drafts. Nothing was sent.` }).show();
      return result;
    } finally { drafting = false; }
  });
  handle('gmail:open', async () => { await shell.openExternal('https://mail.google.com/mail/u/0/#drafts'); });
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 960, minHeight: 680, title: 'Job Applicant Agent', backgroundColor: '#f6f7f9',
    icon: appIconPath,
    webPreferences: { preload: path.join(directory, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(directory, '../../dist/index.html'));
}

app.setName('Job Applicant Agent');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => { app.setAppUserModelId('com.jobapplicant.agent'); if (process.platform === 'darwin') app.dock?.setIcon(appIconPath); registerHandlers(); await createWindow(); }).catch(error => { dialog.showErrorBox('Unable to start', (error as Error).message); app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => { if (drafting) { event.preventDefault(); dialog.showMessageBoxSync({ type: 'info', message: 'Please wait for the drafting batch to finish before quitting.' }); } });
}