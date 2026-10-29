import { describe, expect, it } from 'vitest';
import { buildMime, draftFor, extractJob, extractJobs, extractSkills, extractYears, makeResume, mergeEmailSource, rankJob, reextractImportedJobs } from '../shared/engine';
import { defaultPreferences, getJobDocuments, isMatchingJob, removeJobsFromDocument } from '../shared/types';
import { buildGmailQuery } from '../shared/search';

describe('job extraction and ranking', () => {
  it('builds Gmail OR/AND groups with independent inclusive date criteria', () => {
    const query = { after: '2026-10-01', before: '2026-10-29', query: 'from:recruiter@example.com', terms: ['Selenium', 'Playwright'] };
    expect(buildGmailQuery(query)).toContain('("Selenium" OR "Playwright")');
    expect(buildGmailQuery({ ...query, matchMode: 'all' })).toContain('("Selenium" "Playwright")');
    expect(buildGmailQuery(query)).toContain('(from:recruiter@example.com)');
    expect(buildGmailQuery(query)).toContain(`before:${Math.floor(new Date('2026-10-30T00:00:00').getTime() / 1000)}`);
    expect(buildGmailQuery({ after: '', before: '', query: '', terms: [] })).toBe('');
    expect(() => buildGmailQuery({ ...query, terms: ['Selenium" OR from:other'] })).toThrow();
  });
  it('implements ANY versus ALL focus skills without penalizing alternatives in ANY mode', () => {
    const resume = makeResume('qa.pdf', 'Selenium Playwright');
    const preferences = { ...defaultPreferences, skills: ['Selenium', 'Playwright'], minimumMatch: 80 };
    const selenium = extractJob('Role: QA Engineer\nSelenium', 'input');
    const playwright = extractJob('Role: QA Engineer\nPlaywright', 'input');
    const both = extractJob('Role: QA Engineer\nSelenium Playwright', 'input');
    for (const job of [selenium, playwright, both]) expect(isMatchingJob(rankJob(job, [resume], preferences), preferences)).toBe(true);
    const all = { ...preferences, skillMatchMode: 'all' as const };
    expect(isMatchingJob(rankJob(selenium, [resume], all), all)).toBe(false);
    expect(isMatchingJob(rankJob(playwright, [resume], all), all)).toBe(false);
    expect(isMatchingJob(rankJob(both, [resume], all), all)).toBe(true);
    expect(rankJob(selenium, [resume], preferences).score).toBe(100);
  });
  it('selects resume evidence for the relevant tool, not its filename or generic keywords', () => {
    const selenium = makeResume('Playwright-in-filename.pdf', 'Selenium SQL Java Communication CI/CD');
    const playwright = makeResume('specialized.pdf', 'Playwright');
    const preferences = { ...defaultPreferences, skills: ['Selenium', 'Playwright'] };
    expect(rankJob(extractJob('Role: QA Engineer\nPlaywright SQL Java Communication CI/CD', 'input'), [selenium, playwright], preferences).resumeId).toBe(playwright.id);
    expect(rankJob(extractJob('Role: QA Engineer\nSelenium SQL Java', 'input'), [selenium, playwright], preferences).resumeId).toBe(selenium.id);
  });
  it('normalizes aliases when applying ALL mode', () => {
    const preferences = { ...defaultPreferences, skills: ['Katalon', 'Katalon Studio'], skillMatchMode: 'all' as const, minimumMatch: 0 };
    const ranked = rankJob(extractJob('Role: QA Engineer\nKatalon Studio', 'input'), [makeResume('cv.pdf', 'Katalon')], preferences);
    expect(isMatchingJob(ranked, preferences)).toBe(true);
  });
  it('prioritizes the primary tool in the title when a role also mentions another tool', () => {
    const preferences = { ...defaultPreferences, skills: ['Selenium', 'Playwright'] };
    const selenium = makeResume('selenium.pdf', 'Selenium SQL Java Communication CI/CD');
    const playwright = makeResume('playwright.pdf', 'Playwright SQL');
    const job = extractJob('Role: Playwright QA Engineer\nPlaywright Selenium SQL Java Communication CI/CD', 'input');
    expect(rankJob(job, [selenium, playwright], preferences).resumeId).toBe(playwright.id);
  });
  it('retains multiple email origins without duplicating an existing origin or losing draft IDs', () => {
    const job = { ...extractJob('Role: QA Engineer\nPlaywright', 'email'), draftId: 'draft-1' };
    const origin = { messageId: 'message-1', subject: 'QA vacancy', from: 'Recruiter <recruiter@example.com>', receivedAt: '2026-10-29T10:00:00Z' };
    const merged = mergeEmailSource(mergeEmailSource(job, origin), origin);
    expect(merged.emailSources).toHaveLength(1);
    expect(mergeEmailSource(merged, { ...origin, messageId: 'message-2' }).emailSources).toHaveLength(2);
    expect(merged.draftId).toBe('draft-1');
  });
  it('groups uploaded job PDFs and DOCX files without treating Gmail attachments as uploads', () => {
    const jobs = [extractJob('Role: QA Engineer\nSelenium', 'jobs.pdf'), extractJob('Role: SDET\nPlaywright', 'jobs.pdf'), extractJob('Role: Tester\nKatalon', 'other.DOCX'), extractJob('Role: Java Engineer\nJava', 'Gmail attachment: jobs.pdf')];
    expect(getJobDocuments(jobs).map(document => [document.source, document.jobs])).toEqual(expect.arrayContaining([['jobs.pdf', 2], ['other.DOCX', 1]]));
    expect(getJobDocuments(jobs)).toHaveLength(2);
  });
  it('removes only the selected document records, preserving other sources and original objects', () => {
    const draft = { ...extractJob('Role: QA Engineer\nSelenium', 'jobs.pdf'), draftId: 'draft-1' };
    const other = extractJob('Role: SDET\nPlaywright', 'other.pdf');
    const email = extractJob('Role: QA Engineer\nSelenium', 'Gmail attachment: jobs.pdf');
    const jobs = [draft, other, email];
    expect(getJobDocuments(jobs).find(document => document.source === 'jobs.pdf')?.drafts).toBe(1);
    expect(removeJobsFromDocument(jobs, 'jobs.pdf')).toEqual([other, email]);
    expect(jobs).toHaveLength(3);
    expect(draft.draftId).toBe('draft-1');
    expect(() => removeJobsFromDocument(jobs, 'Gmail attachment: jobs.pdf')).toThrow();
    expect(removeJobsFromDocument(jobs, 'missing.pdf')).toEqual(jobs);
  });
  it('splits a multi-job PDF without mixing requirements across roles', () => {
    const text = 'Job Title: Salesforce QA Lead\nCompany: Acme\nLocation: Pune\nSalesforce Java SQL\n-- 1 of 33 --\nJob Title: Playwright Automation Engineer\nCompany: Beta\nLocation: Remote\nPlaywright TypeScript Selenium\n-- 2 of 33 --\nJob Title: Katalon Test Engineer\nCompany: Gamma\nLocation: Chennai\nKatalon API Testing';
    const jobs = extractJobs(text, '33-page digest.pdf');
    expect(jobs).toHaveLength(3);
    expect(jobs[0].skills).not.toContain('Playwright');
    expect(jobs[1]).toMatchObject({ title: 'Playwright Automation Engineer', company: 'Beta', location: 'Remote' });
    expect(jobs[1].skills).toContain('Selenium');
    expect(jobs[2].skills).toContain('Katalon');
    expect(jobs[2].skills).not.toContain('Salesforce');
  });
  it('keeps continuation pages with a repeated title in the same job', () => {
    const jobs = extractJobs('Job Title: QA Engineer\nCompany: Acme\nSelenium\n-- 1 of 2 --\nJob Title: QA Engineer\nPlaywright and Katalon', 'job.pdf');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].skills).toEqual(expect.arrayContaining(['Selenium', 'Playwright', 'Katalon']));
  });
  it('recognizes numbered and standalone job headings', () => {
    const jobs = extractJobs('1. QA Automation Engineer\nCompany: Acme\nSelenium\n2. SDET\nCompany: Beta\nPlaywright\nKatalon Engineer\nLocation: Remote\nKatalon', 'digest.pdf');
    expect(jobs.map(job => job.title)).toEqual(['QA Automation Engineer', 'SDET', 'Katalon Engineer']);
  });
  it('canonicalizes test-tool aliases and custom skill casing without duplicates', () => {
    expect(extractSkills('Selenium WebDriver Playwright Test Katalon Studio', ['selenium', 'playwright', 'Katalon Studio'])).toEqual(['Selenium', 'Playwright', 'Katalon']);
  });
  it('distinguishes identical role titles at different companies', () => {
    const jobs = extractJobs('Job Title: QA Engineer\nCompany: Acme\nSelenium\nJob Title: QA Engineer\nCompany: Beta\nKatalon', 'digest.pdf');
    expect(jobs).toHaveLength(2);
    expect(jobs.map(job => job.company)).toEqual(['Acme', 'Beta']);
  });
  it('re-extracts old undrafted aggregates without losing existing draft records', () => {
    const original = extractJob('Job Title: Salesforce QA Lead\nCompany: Acme\nSalesforce\nJob Title: Automation Engineer\nCompany: Beta\nPlaywright', 'digest.pdf');
    const drafted = { ...extractJob('Role: Java Engineer\nJava', 'other.pdf'), draftId: 'draft-id', draftStatus: 'ready' as const };
    const result = reextractImportedJobs([original, drafted], ['Playwright']);
    expect(result.jobs).toHaveLength(3);
    expect(result.jobs.find(job => job.draftId)).toEqual(drafted);
    expect(result.jobs.some(job => job.id === original.id)).toBe(false);
    expect(reextractImportedJobs(result.jobs, ['Playwright']).added).toBe(0);
  });
  it('excludes unrelated roles from matching even when resume coverage is high', () => {
    const preferences = { ...defaultPreferences, minimumMatch: 50, skills: ['Selenium', 'Playwright', 'Katalon'] };
    const resume = makeResume('qa.pdf', 'Salesforce SQL Java Selenium Playwright Katalon. 5 years experience');
    const unrelated = rankJob(extractJob('Role: Salesforce QA Lead\nSalesforce SQL Java', 'digest.pdf'), [resume], preferences);
    const relevant = rankJob(extractJob('Role: QA Automation Engineer\nSelenium Playwright Katalon', 'digest.pdf'), [resume], preferences);
    expect(isMatchingJob(unrelated, preferences)).toBe(false);
    expect(isMatchingJob(relevant, preferences)).toBe(true);
    expect(relevant.focusMatchedSkills).toEqual(['Selenium', 'Playwright', 'Katalon']);
  });
  it('extracts labeled fields, bounded skills, and experience ranges', () => {
    const job = extractJob('Job Title: Platform Engineer\nCompany: Acme\nLocation: Remote\nPython, AWS, Docker. 3-5 years of experience. Apply: hiring@acme.com', 'upload');
    expect(job).toMatchObject({ title: 'Platform Engineer', company: 'Acme', location: 'Remote', years: 3, recipient: 'hiring@acme.com' });
    expect(job.skills).toEqual(['Python', 'AWS', 'Docker']);
    expect(extractSkills('Django designer with Google tools')).not.toContain('Go');
    expect(extractYears('Experienced engineer')).toBeNull();
  });
  it('selects the best actual resume rather than inventing evidence from preferences', () => {
    const job = extractJob('Role: Engineer\nLocation: London\nPython AWS. 4 years experience', 'upload');
    const frontend = makeResume('frontend.pdf', 'React CSS. 2 years experience');
    const backend = makeResume('backend.pdf', 'Python AWS. 5 years experience');
    const preferences = { ...defaultPreferences, skills: ['Python', 'AWS'], locations: ['London'] };
    expect(rankJob(job, [frontend, backend], preferences)).toMatchObject({ resumeId: backend.id, score: 100 });
    expect(rankJob(job, [frontend], preferences).score).toBeLessThan(40);
    expect(rankJob(job, [], preferences).score).toBe(0);
  });
  it('does not score unrecognized job descriptions as matches', () => {
    expect(rankJob(extractJob('An interesting opportunity', 'input'), [makeResume('cv.pdf', 'Python')], defaultPreferences).score).toBe(0);
  });
  it('handles entry-level requirements without producing an invalid score', () => {
    const job = extractJob('Role: Developer\nPython. 0 years experience', 'input');
    expect(Number.isFinite(rankJob(job, [makeResume('cv.pdf', 'Python. 0 years experience')], defaultPreferences).score)).toBe(true);
  });
  it('deduplicates jobs with the same normalized content', () => {
    expect(extractJob('Python  engineer', 'email').id).toBe(extractJob('Python engineer', 'pdf').id);
  });
});

describe('draft safety', () => {
  it('uses only resume-supported claims, preserving unknown placeholders', () => {
    const job = extractJob('Role: Engineer\nCompany: Acme\nPython AWS', 'input');
    const resume = makeResume('cv.pdf', 'Python developer');
    const draft = draftFor(job, resume, { ...defaultPreferences, applicantName: 'Alex' });
    expect(draft.body).toContain('Python');
    expect(draft.body).not.toContain('AWS');
    expect(draft.subject).toBe('Application for Engineer - Alex');
  });
  it('rejects recipient and subject header injection', () => {
    expect(() => buildMime({ recipient: 'a@b.com\r\nBcc: other@b.com', subject: 'Hi', body: 'Hello' })).toThrow();
    expect(() => buildMime({ recipient: 'a@b.com', subject: 'Hi\r\nBcc: other@b.com', body: 'Hello' })).toThrow();
  });
  it('builds a UTF-8 multipart draft with the resume attached', () => {
    const mime = buildMime({ recipient: 'a@b.com', subject: 'Application', body: 'Hello' }, { name: 'resume.pdf', bytes: Buffer.from('resume') });
    expect(mime).toContain('multipart/mixed');
    expect(mime).toContain('filename="resume.pdf"');
    expect(mime).toContain(Buffer.from('resume').toString('base64'));
  });
  it('preserves the PDF content type for uppercase file extensions', () => {
    const mime = buildMime({ recipient: 'a@b.com', subject: 'Application', body: 'Hello' }, { name: 'RESUME.PDF', bytes: Buffer.from('resume') });
    expect(mime).toContain('Content-Type: application/pdf');
  });
});