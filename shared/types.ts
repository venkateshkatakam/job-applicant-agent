export interface Preferences {
  locations: string[];
  skills: string[];
  skillMatchMode?: 'any' | 'all';
  minimumMatch: number;
  applicantName: string;
  template: string;
}

export interface Resume {
  id: string;
  name: string;
  text: string;
  skills: string[];
  years: number | null;
  importedAt: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  years: number | null;
  recipient: string;
  text: string;
  source: string;
  importedAt: string;
  score: number;
  resumeId: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  focusMatchedSkills?: string[];
  focusSkillCount?: number;
  emailSources?: EmailSource[];
  reasons: string[];
  draftId?: string;
  draftResumeId?: string;
  draftStatus: 'not-started' | 'ready' | 'failed';
  error?: string;
}

export interface EmailSource {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  attachment?: string;
}

export interface State {
  preferences: Preferences;
  resumes: Resume[];
  jobs: Job[];
  connectedEmail: string | null;
  oauthClientId: string;
  oauthProject?: string;
  lastSync: string | null;
  lastGmailSearch?: { jobIds: string[]; criteria: EmailQuery; searchedAt: string };
}

export interface DraftPreview { subject: string; body: string; recipient: string }
export interface JobDocument { source: string; jobs: number; drafts: number; importedAt: string }
export interface ImportResult { added: number; errors: string[] }
export interface BatchResult { created: number; failed: number; skipped: number }
export interface EmailQuery { after: string; before: string; query: string; terms?: string[]; matchMode?: 'any' | 'all' }

export interface DesktopAPI {
  load(): Promise<State>;
  savePreferences(preferences: Preferences): Promise<State>;
  importResumes(): Promise<ImportResult>;
  removeResume(id: string): Promise<State>;
  importJobs(): Promise<ImportResult>;
  reextractJobs(): Promise<ImportResult>;
  addJob(text: string): Promise<State>;
  updateJob(id: string, fields: Pick<Job, 'title' | 'company' | 'location' | 'recipient'>): Promise<State>;
  deleteJob(id: string): Promise<State>;
  removeJobDocument(source: string): Promise<State>;
  importOAuth(): Promise<State | null>;
  openGoogleSetup(step: 'api' | 'consent' | 'credentials' | 'audience'): Promise<void>;
  connect(clientId: string): Promise<State>;
  cancelSignIn(): Promise<void>;
  disconnect(): Promise<State>;
  fetchEmails(query: EmailQuery): Promise<ImportResult>;
  preview(jobId: string): Promise<DraftPreview>;
  createDrafts(jobIds: string[]): Promise<BatchResult>;
  openDrafts(): Promise<void>;
}

export function isUploadedJobDocument(source: string): boolean {
  return /\.(pdf|docx)$/i.test(source) && !/^Gmail(?: attachment)?:/i.test(source);
}

export function getJobDocuments(jobs: Job[]): JobDocument[] {
  const documents = new Map<string, JobDocument>();
  for (const job of jobs) {
    if (!isUploadedJobDocument(job.source)) continue;
    const document = documents.get(job.source) ?? { source: job.source, jobs: 0, drafts: 0, importedAt: job.importedAt };
    document.jobs++;
    if (job.draftId) document.drafts++;
    if (job.importedAt > document.importedAt) document.importedAt = job.importedAt;
    documents.set(job.source, document);
  }
  return [...documents.values()].sort((left, right) => right.importedAt.localeCompare(left.importedAt));
}

export function removeJobsFromDocument(jobs: Job[], source: string): Job[] {
  if (!isUploadedJobDocument(source)) throw new Error('Choose an uploaded PDF or DOCX job document.');
  return jobs.filter(job => job.source !== source);
}

export function isMatchingJob(job: Job, preferences: Preferences): boolean {
  const focusMatches = job.focusMatchedSkills ?? job.skills.filter(skill => preferences.skills.some(value => value.toLowerCase() === skill.toLowerCase()));
  const focusCount = job.focusSkillCount ?? new Set(preferences.skills.map(skill => skill.toLowerCase())).size;
  const focusEligible = !focusCount || (preferences.skillMatchMode === 'all' ? focusMatches.length >= focusCount : focusMatches.length > 0);
  return Boolean(job.resumeId && job.skills.length && job.score >= preferences.minimumMatch && focusEligible);
}

export const defaultPreferences: Preferences = {
  locations: [],
  skills: [],
  skillMatchMode: 'any',
  minimumMatch: 65,
  applicantName: '',
  template: 'Hello,\n\nI am applying for {{jobTitle}} at {{company}}. {{skillsSummary}}\n\n{{experienceSummary}}\n\nI have attached my resume for your consideration. I would welcome the opportunity to discuss how my experience aligns with your team.\n\nBest regards,\n{{name}}',
};