import { app, safeStorage } from 'electron';
import { appendFile, chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultPreferences, type State } from '../shared/types.js';

export const dataDirectory = () => app.getPath('userData');

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
    throw new Error('Secure OS credential storage is unavailable. Unlock your keychain and restart the app.');
  }
}

export async function saveEncrypted(name: string, value: unknown): Promise<void> {
  requireEncryption();
  const directory = dataDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, name);
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
  await rename(temporary, filename);
  await chmod(filename, 0o600);
}

export async function loadEncrypted<T>(name: string): Promise<T | null> {
  requireEncryption();
  let bytes: Buffer;
  try { bytes = await readFile(path.join(dataDirectory(), name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  return JSON.parse(safeStorage.decryptString(bytes)) as T;
}

export const emptyState = (): State => ({
  preferences: structuredClone(defaultPreferences), resumes: [], jobs: [], connectedEmail: null, oauthClientId: '', lastSync: null,
});

export const loadState = async (): Promise<State> => await loadEncrypted<State>('workspace.enc') ?? emptyState();
export const saveState = (state: State): Promise<void> => saveEncrypted('workspace.enc', state);

export async function logEvent(event: string, details: Record<string, string | number> = {}): Promise<void> {
  try {
    const filename = path.join(dataDirectory(), 'activity.log');
    await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
    try { if ((await stat(filename)).size > 1_000_000) await rename(filename, `${filename}.1`); } catch {}
    await appendFile(filename, `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`, { mode: 0o600 });
  } catch { console.warn('Activity log unavailable'); }
}