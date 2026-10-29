import { defaultPreferences, removeJobsFromDocument, type DesktopAPI, type Job, type Resume, type State } from '../shared/types';

declare global { interface Window { applicant?: DesktopAPI } }
export const isPreview = !window.applicant;
const now = new Date().toISOString();
const previewResumes: Resume[] = [
  { id: 'preview-frontend', name: 'Alex_Morgan_Frontend.pdf', text: 'React TypeScript JavaScript CSS Figma. 5 years experience.', skills: ['React', 'TypeScript', 'JavaScript', 'CSS', 'Figma'], years: 5, importedAt: now },
  { id: 'preview-fullstack', name: 'Alex_Morgan_Fullstack.docx', text: 'React Node.js TypeScript PostgreSQL AWS. 4 years experience.', skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS'], years: 4, importedAt: now },
];
const examples = [
  ['Senior Frontend Engineer', 'Linear Labs', 'San Francisco, CA', ['React', 'TypeScript', 'Figma'], 96, 'preview-frontend', 'ready'],
  ['Product Engineer', 'Notion Works', 'Remote', ['React', 'TypeScript', 'Node.js'], 92, 'preview-fullstack', 'not-started'],
  ['Frontend Developer', 'Vercel Studio', 'New York, NY', ['React', 'Next.js', 'TypeScript'], 88, 'preview-frontend', 'not-started'],
  ['Full Stack Engineer', 'Arc Systems', 'Remote', ['Node.js', 'PostgreSQL', 'AWS'], 85, 'preview-fullstack', 'ready'],
  ['UI Engineer', 'Figma Collective', 'San Francisco, CA', ['React', 'CSS', 'Figma'], 78, 'preview-frontend', 'not-started'],
  ['Software Engineer II', 'Dropbox Labs', 'Austin, TX', ['Python', 'React', 'Docker'], 58, 'preview-fullstack', 'not-started'],
] as const;
let state: State = {
  preferences: { ...defaultPreferences, locations: ['Remote', 'San Francisco', 'New York'], skills: ['React', 'TypeScript', 'Node.js'], applicantName: 'Alex Morgan', minimumMatch: 65 },
  resumes: previewResumes,
  jobs: examples.map((value, index): Job => ({
    id: `preview-${index}`, title: value[0], company: value[1], location: value[2], skills: [...value[3]], years: 3,
    recipient: 'careers@example.com', text: `Job Title: ${value[0]}\nCompany: ${value[1]}\nLocation: ${value[2]}\n\nWe are looking for an engineer to help build thoughtful products.\n\nRequired skills: ${value[3].join(', ')}\nExperience: 3+ years experience\n\nCollaborate with product and design teams, ship reliable software, and make a meaningful impact on the customer experience.`,
    source: index % 2 ? 'Uploaded PDF' : 'Gmail', importedAt: now, score: value[4], resumeId: value[5],
    matchedSkills: value[3].filter(skill => !['Next.js', 'Python', 'Docker'].includes(skill)), missingSkills: value[3].filter(skill => ['Next.js', 'Python', 'Docker'].includes(skill)),
    reasons: ['Skills evidenced in selected resume', 'Location compared with preferences', 'Experience requirement met'],
    draftStatus: value[6], ...(value[6] === 'ready' ? { draftId: `demo-${index}`, draftResumeId: value[5] } : {}),
  })), connectedEmail: null, oauthClientId: '', lastSync: null,
};
const snapshot = () => structuredClone(state);
const desktopOnly = async (): Promise<never> => { throw new Error('This action requires the desktop app. Run npm run dev:desktop. Browser preview uses fictional sample data only.'); };

export const api: DesktopAPI = window.applicant ?? {
  load: async () => snapshot(),
  savePreferences: async preferences => { state.preferences = structuredClone(preferences); return snapshot(); },
  importResumes: desktopOnly, importJobs: desktopOnly, importOAuth: desktopOnly, connect: desktopOnly,
  reextractJobs: desktopOnly,
  openGoogleSetup: desktopOnly,
  cancelSignIn: async () => {},
  disconnect: desktopOnly, fetchEmails: desktopOnly, createDrafts: desktopOnly, openDrafts: desktopOnly,
  removeResume: async id => { state.resumes = state.resumes.filter(value => value.id !== id); return snapshot(); },
  addJob: desktopOnly,
  updateJob: async (id, fields) => { state.jobs = state.jobs.map(job => job.id === id ? { ...job, ...fields } : job); return snapshot(); },
  deleteJob: async id => { state.jobs = state.jobs.filter(job => job.id !== id); return snapshot(); },
  removeJobDocument: async source => { state.jobs = removeJobsFromDocument(state.jobs, source); return snapshot(); },
  preview: async id => {
    const job = state.jobs.find(value => value.id === id);
    if (!job) throw new Error('Job not found.');
    return { recipient: job.recipient, subject: `Application for ${job.title} - ${state.preferences.applicantName}`, body: `Hello,\n\nI am applying for ${job.title} at ${job.company}. My resume includes experience with ${job.matchedSkills.join(', ')}, which aligns with the skills listed in your job description.\n\nMy attached resume provides details of my professional background.\n\nI would welcome the opportunity to discuss how my experience aligns with your team.\n\nBest regards,\n${state.preferences.applicantName}` };
  },
};