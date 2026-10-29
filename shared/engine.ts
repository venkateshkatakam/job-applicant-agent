import { createHash, randomUUID } from 'node:crypto';
import type { DraftPreview, EmailSource, Job, Preferences, Resume } from './types.js';

const skillNames = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', '.NET', 'Go', 'Rust', 'Ruby', 'PHP',
  'React', 'Angular', 'Vue', 'Node.js', 'Next.js', 'Django', 'Flask', 'FastAPI', 'Spring',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'Linux', 'HTML', 'CSS', 'Tailwind',
  'Figma', 'UX', 'UI', 'Agile', 'Scrum', 'Product Management', 'Project Management',
  'Excel', 'Tableau', 'Power BI', 'Salesforce', 'Machine Learning', 'Data Analysis',
  'Communication', 'Leadership', 'Customer Service', 'Marketing', 'Sales', 'Accounting',
  'Selenium', 'Playwright', 'Katalon', 'Cypress', 'TestNG', 'JUnit', 'Cucumber', 'Appium',
  'Postman', 'REST Assured', 'API Testing', 'Test Automation', 'Manual Testing', 'JMeter',
];

const aliases: Record<string, string[]> = {
  'Node.js': ['nodejs', 'node.js'], 'Next.js': ['nextjs', 'next.js'],
  'JavaScript': ['javascript', 'js'], 'TypeScript': ['typescript', 'ts'],
  'PostgreSQL': ['postgresql', 'postgres'], 'AWS': ['aws', 'amazon web services'],
  'GCP': ['gcp', 'google cloud'], 'CI/CD': ['ci/cd', 'ci cd'],
  'Selenium': ['selenium', 'selenium webdriver'], 'Katalon': ['katalon', 'katalon studio'],
  'Playwright': ['playwright', 'playwright test'], 'Test Automation': ['test automation', 'automation testing', 'automated testing'],
};

function contains(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(text);
}

export function extractSkills(text: string, custom: string[] = []): string[] {
  const unique = new Map<string, string>();
  const canonicalCustom = custom.map(skill => skillNames.find(name => name.toLowerCase() === skill.toLowerCase() || aliases[name]?.some(alias => alias.toLowerCase() === skill.toLowerCase())) ?? skill);
  for (const skill of [...skillNames, ...canonicalCustom]) {
    if ((aliases[skill] ?? [skill]).some(term => contains(text, term))) {
      unique.set(skill.toLowerCase(), skill);
    }
  }
  return [...unique.values()];
}

export function extractYears(text: string): number | null {
  const matches = [...text.matchAll(/\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:relevant\s+|professional\s+|commercial\s+)?experience\b/gi)];
  return matches.length ? Math.max(...matches.map(match => Number(match[1]))) : null;
}

function field(text: string, names: string): string {
  return new RegExp(`^(?:${names})\\s*[:\\-]\\s*(.+)$`, 'im').exec(text)?.[1]?.trim() ?? '';
}

const roleWords = /\b(engineer|developer|tester|analyst|architect|consultant|lead|manager|administrator|specialist|designer|scientist|sdet|qa|quality assurance)\b/i;
const titleHeading = /^(?:(?:job\s*(?:\d+[.):\-]?\s*)?)?(?:job title|position|role|title)\s*[:\-]\s*|(?:we(?:'re| are)\s+)?(?:hiring(?:\s+for)?|opening\s+for|job opening|urgent requirement)\s*[:\-]\s*)(.+)$/i;

export function extractJobs(text: string, source: string, customSkills: string[] = []): Job[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const boundaries: { index: number; title: string; company: string }[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim().replace(/^[#*\s]+/, '').replace(/\*+$/, '').trim();
    const numbered = /^(?:(?:job|opening|opportunity)\s*)?\d+[.)\]:\-]\s*(.+)$/i.exec(line);
    const candidate = titleHeading.exec(line)?.[1] ?? (numbered ? titleHeading.exec(numbered[1])?.[1] ?? numbered[1] : '');
    const nearby = lines.slice(index + 1, index + 7).join('\n');
    const standalone = !candidate && line.length < 140 && roleWords.test(line) && !/[:.!?]/.test(line) && /^(?:company|location|experience|client|employer|job location)\s*:/im.test(nearby) ? line : '';
    const title = candidate || standalone;
    if (!title || title.length > 160 || !roleWords.test(title)) continue;
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const company = field(nearby, 'company|company name|employer|client').toLowerCase();
    const previous = boundaries[boundaries.length - 1];
    if (previous?.title === normalized && (!company || !previous.company || previous.company === company)) continue;
    boundaries.push({ index, title: normalized, company });
  }
  if (boundaries.length < 2) return [extractJob(text, source, customSkills)];
  const jobs = boundaries.map((boundary, index) => {
    const section = lines.slice(boundary.index, boundaries[index + 1]?.index ?? lines.length)
      .filter(line => !/^\s*(?:--\s*)?(?:page\s+)?\d+\s+(?:of|\/)\s+\d+\s*(?:--)?\s*$/i.test(line)).join('\n').trim();
    const job = extractJob(section, source, customSkills);
    const heading = lines[boundary.index].trim().replace(/^[#*\s]+/, '').replace(/\*+$/, '').replace(/^(?:(?:job|opening|opportunity)\s*)?\d+[.)\]:\-]\s*/i, '');
    const title = titleHeading.exec(heading)?.[1] ?? heading;
    return { ...job, title };
  });
  return [...new Map(jobs.map(job => [job.id, job])).values()];
}

export function reextractImportedJobs(jobs: Job[], customSkills: string[]): { jobs: Job[]; added: number } {
  const existing = new Map(jobs.map(job => [job.id, job]));
  const output = new Map(jobs.filter(job => job.draftId).map(job => [job.id, job]));
  let added = 0;
  for (const original of jobs) {
    if (original.draftId) continue;
    const extracted = extractJobs(original.text, original.source, customSkills);
    if (extracted.length === 1) { if (!output.has(original.id)) output.set(original.id, original); continue; }
    for (const job of extracted) {
      if (output.has(job.id)) continue;
      output.set(job.id, existing.get(job.id) ?? { ...job, importedAt: original.importedAt, ...(original.emailSources ? { emailSources: original.emailSources } : {}) });
      if (!existing.has(job.id)) added++;
    }
  }
  return { jobs: [...output.values()], added };
}

export function extractJob(text: string, source: string, customSkills: string[] = []): Job {
  const title = field(text, 'job title|position|role|title|subject');
  const firstLine = text.split('\n').map(line => line.trim()).find(line => line.length > 3 && !line.includes('@'));
  return {
    id: createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex').slice(0, 24),
    title: title || firstLine?.slice(0, 120) || 'Untitled opportunity',
    company: field(text, 'company|company name|organization|employer') || 'Not specified',
    location: field(text, 'location|job location|work location') || (/\bremote\b/i.test(text) ? 'Remote' : 'Not specified'),
    skills: extractSkills(text, customSkills),
    years: extractYears(text),
    recipient: /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/.exec(text)?.[0] ?? '',
    text, source, importedAt: new Date().toISOString(), score: 0, resumeId: null,
    matchedSkills: [], missingSkills: [], reasons: [], draftStatus: 'not-started',
  };
}

export function makeResume(name: string, text: string, customSkills: string[] = []): Resume {
  return { id: randomUUID(), name, text, skills: extractSkills(text, customSkills), years: extractYears(text), importedAt: new Date().toISOString() };
}

export function mergeEmailSource(job: Job, source: EmailSource): Job {
  const sources = job.emailSources ?? [];
  if (sources.some(existing => existing.messageId === source.messageId && existing.attachment === source.attachment)) return job;
  return { ...job, emailSources: [...sources, source] };
}

export function rankJob(job: Job, resumes: Resume[], preferences: Preferences): Job {
  const skills = extractSkills(job.text, preferences.skills);
  const focusSkills = extractSkills(preferences.skills.join('\n'), preferences.skills);
  const configured = skills.filter(skill => focusSkills.includes(skill));
  const titleSkills = extractSkills(job.title, preferences.skills);
  const focusWeight = (skill: string) => titleSkills.includes(skill) ? 3 : 1;
  const totalFocusWeight = configured.reduce((total, skill) => total + focusWeight(skill), 0);
  const candidates = resumes.map(resume => {
    const resumeSkills = extractSkills(resume.text, preferences.skills);
    const matched = skills.filter(skill => resumeSkills.some(value => value.toLowerCase() === skill.toLowerCase()));
    const evidencedFocus = configured.filter(skill => resumeSkills.includes(skill));
    const focusCoverage = totalFocusWeight ? evidencedFocus.reduce((total, skill) => total + focusWeight(skill), 0) / totalFocusWeight : 0;
    const skillScore = skills.length ? matched.length / skills.length : 0;
    const configuredScore = focusSkills.length ? preferences.skillMatchMode === 'all' ? configured.length / focusSkills.length : Number(configured.length > 0) : 1;
    const locationScore = !preferences.locations.length || preferences.locations.some(location => job.location.toLowerCase().includes(location.toLowerCase())) ? 1 : 0;
    const experienceScore = job.years === null || job.years === 0 ? 1 : resume.years === null ? 0 : Math.min(resume.years / job.years, 1);
    const score = skills.length ? Math.round(70 * skillScore + 10 * configuredScore + 10 * locationScore + 10 * experienceScore) : 0;
    return { resume, matched, score, focusCoverage, focusCount: evidencedFocus.length, locationScore, experienceScore };
  }).sort((left, right) => right.focusCoverage - left.focusCoverage || right.score - left.score);
  const best = candidates[0];
  return {
    ...job, skills, focusMatchedSkills: configured, focusSkillCount: focusSkills.length, score: best?.score ?? 0, resumeId: best?.resume.id ?? null,
    matchedSkills: best?.matched ?? [], missingSkills: skills.filter(skill => !best?.matched.includes(skill)),
    reasons: [
      `${best?.matched.length ?? 0} of ${skills.length} identified skills evidenced in resume`,
      best?.locationScore ? 'Location fits preferences' : 'Location is unknown or outside preferences',
      job.years === null ? 'Experience requirement not specified' : best?.experienceScore === 1 ? 'Experience requirement met' : 'Experience requirement not fully evidenced',
      ...(focusSkills.length ? [`${configured.length} of ${focusSkills.length} focus skills appear in this job (${preferences.skillMatchMode === 'all' ? 'ALL required' : 'ANY accepted'})`, ...((preferences.skillMatchMode === 'all' ? configured.length < focusSkills.length : !configured.length) ? ['Focus skill rule not met: excluded from Matching and draft batches'] : [])] : []),
      ...(configured.length && best ? [`Selected resume evidences ${best.focusCount} of ${configured.length} relevant focus tools; tools named in the job title receive higher selection weight`] : []),
      ...(!skills.length ? ['No recognized skills: manual review required'] : []),
    ],
  };
}

export function draftFor(job: Job, resume: Resume, preferences: Preferences): DraftPreview {
  const supported = extractSkills(resume.text, preferences.skills);
  const matched = job.skills.filter(skill => supported.includes(skill));
  const values: Record<string, string> = {
    jobTitle: job.title, company: job.company, location: job.location,
    name: preferences.applicantName || '[Your name]', resumeName: resume.name,
    skillsSummary: matched.length ? `My resume includes experience with ${matched.join(', ')}, which aligns with the skills listed in your job description.` : 'Please find my background in the attached resume.',
    experienceSummary: resume.years === null ? 'My attached resume provides details of my professional background.' : `My resume describes ${resume.years} years of experience.`,
  };
  const body = preferences.template.replace(/\{\{(\w+)\}\}/g, (original, key: string) => values[key] ?? original);
  return { recipient: job.recipient, subject: `Application for ${job.title} - ${values.name}`, body };
}

function base64Lines(value: Buffer): string {
  return value.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}

export function buildMime(draft: DraftPreview, attachment?: { name: string; bytes: Buffer }): string {
  if (!/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(draft.recipient)) throw new Error('Review the recruiter email address before creating a draft.');
  if (/[\r\n]/.test(draft.subject)) throw new Error('Invalid email subject.');
  const boundary = `applicant-${randomUUID()}`;
  const headers = [`To: ${draft.recipient}`, `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString('base64')}?=`, 'MIME-Version: 1.0'];
  const text = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(draft.body))].join('\r\n');
  if (!attachment) return [...headers, text].join('\r\n');
  const safeName = attachment.name.replace(/[^a-zA-Z0-9._ -]/g, '_');
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, text,
    `--${boundary}`, `Content-Type: ${safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}; name="${safeName}"`,
    `Content-Disposition: attachment; filename="${safeName}"`, 'Content-Transfer-Encoding: base64', '', base64Lines(attachment.bytes), `--${boundary}--`, ''].join('\r\n');
}