import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, Check, CheckCheck, ChevronDown, ChevronRight, CircleCheck, CircleHelp, Clock3, FileText, FolderOpen, Inbox, LayoutDashboard, LoaderCircle, Mail, MapPin, MoreHorizontal, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api, isPreview } from './api';
import { GmailSetup } from './GmailSetup';
import { GmailSearchForm } from './GmailSearchForm';
import { MatchModeControl } from './MatchModeControl';
import { JobSource } from './JobSource';
import { getJobDocuments, isMatchingJob } from '../shared/types';
import type { DraftPreview, EmailQuery, ImportResult, Job, Preferences, State } from '../shared/types';

type View = 'dashboard' | 'documents' | 'resumes' | 'template' | 'preferences';
type Modal = 'import' | 'gmail' | 'batch' | 'help' | null;
const viewTitles: Record<View, string> = { dashboard: 'Overview', documents: 'Job documents', resumes: 'My resumes', template: 'Email template', preferences: 'Preferences' };
const splitList = (value: string) => [...new Set(value.split(',').map(part => part.trim()).filter(Boolean))];
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const markUrl = new URL('mark.svg', document.baseURI).href;

function ModalFrame({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { document.removeEventListener('keydown', listener); previous?.focus(); };
  }, [close]);
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`}><header><h2>{title}</h2><button className="icon-button" title="Close dialog" onClick={close}><X size={20} /></button></header>{children}</div></div>;
}

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<Modal>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'draft'>('overview');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sort, setSort] = useState('score');
  const [selected, setSelected] = useState<string[]>([]);
  const [paste, setPaste] = useState('');
  const [query, setQuery] = useState<EmailQuery>({ after: '', before: '', query: '', terms: [], matchMode: 'any' });
  const [latestSearchOnly, setLatestSearchOnly] = useState(false);
  const [settings, setSettings] = useState<Preferences | null>(null);
  const [fieldEdits, setFieldEdits] = useState({ title: '', company: '', location: '', recipient: '' });
  const [completion, setCompletion] = useState<string | null>(null);
    const [documentSource, setDocumentSource] = useState<string | null>(null);
  const gmailAttempt = useRef(0);

  useEffect(() => { api.load().then(value => { setState(value); setSettings(value.preferences); }).catch(error => setToast({ text: String(error), error: true })); }, []);
  useEffect(() => { if (!toast || toast.error) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);

  async function run(label: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    try { await operation(); } catch (error) { const message = (error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''); if (message !== 'Google sign-in cancelled.') setToast({ text: message, error: true }); }
    finally { setBusy(''); }
  }
  const refresh = async () => { const next = await api.load(); setState(next); return next; };
  const signingIn = busy === 'Setting up Google sign-in' || busy === 'Waiting for Google sign-in';
  function closeGmail() {
    setModal(null);
    if (signingIn) {
      gmailAttempt.current++;
      void api.cancelSignIn().catch(error => setToast({ text: (error as Error).message, error: true }));
    }
  }
  async function finishGoogleSignIn(clientId: string, attempt: number) {
    const next = await api.connect(clientId);
    if (attempt !== gmailAttempt.current) return;
    setState(next);
    setToast({ text: 'Gmail connected securely.', error: false });
  }
  const importNotice = (result: ImportResult, resumes = false) => setToast({ text: `${result.added} ${resumes ? 'resumes' : 'jobs'} imported.${result.errors.length ? ` ${result.errors.join(' ')}` : ''}`, error: result.errors.length > 0 });
  async function importDocuments(resumes: boolean) { await run('Importing documents', async () => { importNotice(await (resumes ? api.importResumes() : api.importJobs()), resumes); await refresh(); }); }
  async function openJob(job: Job) {
    setJobId(job.id); setDetailTab('overview'); setPreview(null);
    setFieldEdits({ title: job.title, company: job.company, location: job.location, recipient: job.recipient });
    if (job.resumeId) await run('Preparing preview', async () => setPreview(await api.preview(job.id)));
  }

  if (!state || !settings) return <div className="startup"><img src={markUrl} alt="" width={48} height={48} /><h1>Job Applicant Agent</h1>{toast ? <p role="alert">{toast.text}</p> : <LoaderCircle className="spin" />}</div>;
  const matchedJobs = state.jobs.filter(job => isMatchingJob(job, state.preferences));
  const jobDocuments = getJobDocuments(state.jobs);
  const removalDocument = jobDocuments.find(document => document.source === documentSource);
  const drafts = state.jobs.filter(job => job.draftId);
  const available = matchedJobs.filter(job => !job.draftId);
  const filtered = state.jobs.filter(job => {
    const searchable = `${job.title} ${job.company} ${job.location} ${job.skills.join(' ')} ${job.source} ${(job.emailSources ?? []).map(source => `${source.subject} ${source.from} ${source.receivedAt ?? ''}`).join(' ')}`.toLowerCase();
    const gmail = job.source.startsWith('Gmail') || !!job.emailSources?.length;
    return (!latestSearchOnly || !!state.lastGmailSearch?.jobIds.includes(job.id)) && searchable.includes(search.toLowerCase()) && (filter === 'all' || (filter === 'matched' ? matchedJobs.includes(job) : filter === 'drafts' ? !!job.draftId : job.draftStatus === 'failed')) && (sourceFilter === 'all' || (sourceFilter === 'gmail' ? gmail : !gmail));
  }).sort((left, right) => sort === 'score' ? right.score - left.score : right.importedAt.localeCompare(left.importedAt));
  const currentJob = state.jobs.find(job => job.id === jobId);
  const visibleAvailable = filtered.filter(job => available.includes(job));
  const batchIds = (selected.length ? selected : visibleAvailable.map(job => job.id)).filter(id => visibleAvailable.some(job => job.id === id));
  const average = matchedJobs.length ? Math.round(matchedJobs.reduce((total, job) => total + job.score, 0) / matchedJobs.length) : 0;
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); await run('Saving preferences', async () => { const next = await api.savePreferences(settings); setState(next); setSettings(next.preferences); setToast({ text: 'Saved. Job matches have been updated.', error: false }); });
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Job Applicant Agent overview" onClick={event => { event.preventDefault(); setView('dashboard'); }}><img src={markUrl} alt="" /><span>Job Applicant<span className="brand-sub">AGENT</span></span></a>
      <div className="workspace-switch"><span className="workspace-avatar">P</span><span>Personal workspace<small>Local workspace</small></span><ChevronDown size={15} /></div>
      <span className="nav-caption">WORKSPACE</span>
      <nav aria-label="Main navigation">
        {([{ id: 'dashboard', icon: LayoutDashboard, label: 'Overview' }, { id: 'documents', icon: FolderOpen, label: 'Job documents' }, { id: 'resumes', icon: FileText, label: 'My resumes' }, { id: 'template', icon: Mail, label: 'Email template' }, { id: 'preferences', icon: SlidersHorizontal, label: 'Preferences' }] as const).map(item => <button key={item.id} aria-label={item.label} title={item.label} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'resumes' && <span className="nav-count">{state.resumes.length}</span>}{item.id === 'documents' && <span className="nav-count">{jobDocuments.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="safety-note"><ShieldCheck size={23} /><strong>You're always in control.</strong><p>Drafts only. Nothing is sent without you.</p><span><span className="status-dot" /> Safe by design</span></div>
        <button className="nav-item help" onClick={() => setModal('help')}><CircleHelp size={18} />Help & resources<ArrowUpRight size={15} /></button>
        <div className="profile"><span className="profile-avatar">{(state.preferences.applicantName || 'Your workspace').split(' ').map(value => value[0]).slice(0, 2).join('')}</span><span><strong>{state.preferences.applicantName || 'Your workspace'}</strong><small>Personal account</small></span><button className="icon-button" title="Account preferences" onClick={() => setView('preferences')}><Settings2 size={17} /></button></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={14} /><strong>{viewTitles[view]}</strong></div><div className="topbar-actions"><span className="local-badge"><span className="status-dot" /> Local-first workspace</span><button className="icon-button notification-button" title="View drafting notifications" onClick={() => { setToast({ text: completion ?? 'No new notifications. Drafting completion appears here and as a desktop notification.', error: false }); }}><Bell size={19} />{completion && <i />}</button><span className="top-avatar">{state.preferences.applicantName?.[0] || 'Y'}</span></div></header>
      {isPreview && <div className="preview-bar"><span>INTERACTIVE PREVIEW</span> Fictional sample data. Gmail and file actions require the desktop app.</div>}
      <main>
  <div className="page-heading"><div><div className="eyebrow">YOUR NEXT CHAPTER</div><h1>{view === 'dashboard' ? 'A better match. A better next step.' : viewTitles[view]}</h1><p>{view === 'dashboard' ? 'The right opportunities, matched to you. Ready when you are.' : view === 'documents' ? 'Uploaded job descriptions and their extracted opportunities.' : view === 'resumes' ? 'Your experience, ready for the right opportunity.' : view === 'template' ? 'A personal introduction for every opportunity.' : 'Make your next move on your terms.'}</p></div>{view === 'dashboard' ? <button className="button primary" onClick={() => setModal('import')}><Plus size={17} />Import jobs</button> : view === 'documents' ? <button className="button primary" disabled={!!busy} onClick={() => void importDocuments(false)}><Upload size={17} />Upload job documents</button> : view === 'resumes' ? <button className="button primary" disabled={!!busy} onClick={() => void importDocuments(true)}><Upload size={17} />Upload resumes</button> : null}</div>

        {view === 'dashboard' && <>
          <div className="metrics">
            {[{ label: 'Jobs discovered', value: state.jobs.length, icon: BriefcaseBusiness, note: 'Across all your sources', color: 'blue' }, { label: 'Matching your profile', value: matchedJobs.length, icon: Sparkles, note: `${state.preferences.minimumMatch}% minimum match`, color: 'green' }, { label: 'Drafts ready', value: drafts.length, icon: Mail, note: 'Waiting for your review', color: 'amber' }, { label: 'Average match', value: `${average}%`, icon: CircleCheck, note: 'Among matching jobs', color: 'violet' }].map(metric => <div className="metric" key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.color}`}><metric.icon size={18} /></span></div><strong>{metric.value}</strong><small>{metric.label === 'Matching your profile' && <span className="tiny-dot" />}{metric.note}</small><div className={`metric-line ${metric.color}`} /></div>)}
          </div>

          <div className="dashboard-grid"><section className="jobs-section">
            <div className="section-heading"><div><h2>Your opportunities <span className="count-pill">{state.jobs.length}</span></h2><p>{state.preferences.skills.length ? `${state.preferences.skills.join(' / ')} · ${state.preferences.minimumMatch}% minimum` : 'Ranked against your uploaded resumes'}</p></div><div className="opportunity-actions">{!!state.jobs.length && <button className="button subtle compact" title="Split previously imported multi-job documents and refresh matches" disabled={!!busy} onClick={() => void run('Re-analyzing imported jobs', async () => { const result = await api.reextractJobs(); const next = await refresh(); setSelected([]); setToast({ text: `Re-analysis complete: ${next.jobs.length} jobs in your workspace; ${result.added} separate jobs recovered. Existing drafts were preserved.`, error: false }); })}><RefreshCw size={15} />Re-analyze</button>}<button className="button subtle compact" title="Sync Gmail" disabled={!!busy} onClick={() => setModal('gmail')}><ArrowDownToLine size={15} />Sync Gmail</button></div></div>
            <div className="tabs-bar"><div className="tabs" role="tablist" aria-label="Opportunity status">{[['all', 'All jobs', state.jobs.length], ['matched', 'Matching', matchedJobs.length], ['drafts', 'Drafts ready', drafts.length], ['failed', 'Needs attention', state.jobs.filter(job => job.draftStatus === 'failed').length]].map(([id, label, count]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'selected' : ''} onClick={() => { setFilter(String(id)); setSelected([]); }}>{label}<span>{count}</span></button>)}</div></div>
            <div className="table-tools"><label className="search-box"><Search size={16} /><input aria-label="Search jobs" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search roles, companies, or skills..." />{search && <button className="icon-button" title="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label><label className="select-wrap"><SlidersHorizontal size={14} /><select aria-label="Filter by source" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="gmail">Gmail</option><option value="files">Documents</option></select></label><label className="select-wrap sort"><ArrowDown size={14} /><select aria-label="Sort jobs" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Best match</option><option value="date">Newest</option></select></label></div>
            <div className="result-scope"><button className="button subtle compact" onClick={() => { setSearch(''); setSourceFilter('all'); setFilter('all'); setSort('score'); setSelected([]); setLatestSearchOnly(false); }}><RefreshCw size={13} />Reset filters</button>{state.lastGmailSearch && <label><input type="checkbox" checked={latestSearchOnly} onChange={event => { setLatestSearchOnly(event.target.checked); setSelected([]); }} />Latest Gmail search only ({state.lastGmailSearch.jobIds.filter(id => state.jobs.some(job => job.id === id)).length})</label>}</div>
            <div className="table-scroll"><table><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Select all visible eligible jobs" checked={filtered.some(job => available.includes(job)) && filtered.filter(job => available.includes(job)).every(job => selected.includes(job.id))} onChange={event => setSelected(event.target.checked ? filtered.filter(job => available.includes(job)).map(job => job.id) : [])} /></th><th>Job opportunity & source</th><th>Match <ArrowDown size={12} /></th><th>Selected resume</th><th>Draft status</th><th /></tr></thead><tbody>{filtered.map((job, index) => {
              const resume = state.resumes.find(value => value.id === (job.draftId ? job.draftResumeId : job.resumeId));
              return <tr key={job.id} style={{ animationDelay: `${index * 35}ms` }} className={selected.includes(job.id) ? 'checked-row' : ''}>
                <td className="check-cell"><input aria-label={`Select ${job.title}`} type="checkbox" disabled={!available.includes(job)} checked={selected.includes(job.id)} onChange={event => setSelected(event.target.checked ? [...selected, job.id] : selected.filter(id => id !== job.id))} /></td>
                <td><button className="job-link" onClick={() => void openJob(job)}><span className={`company-logo logo-${index % 6}`}>{job.company === 'Not specified' ? <BriefcaseBusiness size={19} /> : job.company.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span><strong>{job.title}</strong><span className="job-meta">{job.company}<i />{job.location}</span><span className="row-skills">{job.skills.slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}{job.skills.length > 3 && <span>+{job.skills.length - 3}</span>}</span><JobSource job={job} /></span></button></td>
                <td><div className={`score ${isMatchingJob(job, state.preferences) ? 'high' : 'low'}`}><span>{job.score}%</span><div><i style={{ width: `${job.score}%` }} /></div></div></td>
                <td><span className="resume-cell" title={resume?.name}><FileText size={14} /><span>{resume?.name.replace(/\.(pdf|docx)$/i, '') || 'No resume'}</span></span><span className="file-type">{resume?.name.split('.').pop()?.toUpperCase() ?? 'UPLOAD REQUIRED'}</span></td>
                <td><span className={`draft-badge ${job.draftStatus}`}>{job.draftStatus === 'ready' ? <><CircleCheck size={12} />Ready to review</> : job.draftStatus === 'failed' ? <><CircleHelp size={12} />Needs attention</> : <><Clock3 size={12} />Not drafted</>}</span></td>
                <td><button className="icon-button" title={`Review ${job.title}`} onClick={() => void openJob(job)}><MoreHorizontal size={18} /></button></td>
              </tr>;
            })}</tbody></table></div>
            {!filtered.length && <div className="empty-state"><span className="empty-icon">{state.jobs.length ? <Search size={27} /> : <Inbox size={29} />}</span><h3>{state.jobs.length ? 'No opportunities found' : 'Your next opportunity starts here'}</h3><p>{state.jobs.length ? 'Try another search or clear your filters.' : 'Import job descriptions and add your resumes to see your matches.'}</p><button className="button subtle" onClick={() => state.jobs.length ? (setSearch(''), setFilter('all'), setSourceFilter('all')) : setModal('import')}>{state.jobs.length ? 'Clear filters' : 'Import your first jobs'}<ArrowRight size={15} /></button></div>}
            <div className="table-footer"><span>{selected.length ? `${selected.length} selected` : `${filtered.length} of ${state.jobs.length} opportunities`}<span className="footer-separator">·</span>Ranked for you</span><span className="table-page">Page 1 of 1</span></div>
            <div className="batch-bar"><div className="batch-icon"><Sparkles size={20} /></div><div><strong>Good matches deserve a great introduction.</strong><span>{batchIds.length} matching {batchIds.length === 1 ? 'job is' : 'jobs are'} ready for a personalized draft.</span></div><button className="button primary" disabled={!!busy || !batchIds.length} onClick={() => setModal('batch')}><Mail size={15} />Create drafts<ArrowRight size={15} /></button></div>
          </section>

          <aside className="right-rail"><section className="connection-section"><div className="rail-heading"><h3>Connected account</h3><span className={`status-dot ${state.connectedEmail ? '' : 'muted-dot'}`} /></div><div className="gmail-identity"><span className="gmail-logo"><Mail size={24} /></span><div><strong>Gmail</strong><span>{state.connectedEmail || 'Not connected'}</span></div></div><div className="connection-status"><span className={`status-dot ${state.connectedEmail ? '' : 'muted-dot'}`} />{state.connectedEmail ? 'Securely connected' : 'Ready to connect'}</div><button className="button subtle full" disabled={!!busy} onClick={() => setModal('gmail')}>{state.connectedEmail ? 'Manage connection' : 'Connect Gmail'}<ArrowUpRight size={14} /></button>{state.lastSync && <small className="sync-time">Last synced {dateLabel(state.lastSync)}</small>}</section>
            <section className="rail-section"><div className="rail-heading"><h3>Your match preferences</h3><button className="icon-button" title="Edit preferences" onClick={() => setView('preferences')}><SlidersHorizontal size={15} /></button></div><div className="preference-group"><span><MapPin size={13} />Preferred locations</span><div className="tags">{state.preferences.locations.length ? state.preferences.locations.map(location => <span key={location}>{location}</span>) : <small>Any location</small>}</div></div><div className="preference-group"><span><Sparkles size={13} />Your focus skills</span><div className="tags green-tags">{state.preferences.skills.length ? state.preferences.skills.slice(0, 5).map(skill => <span key={skill}>{skill}</span>) : <small>Not configured</small>}</div></div><div className="threshold-label"><span>Minimum match</span><strong>{state.preferences.minimumMatch}%</strong></div><div className="threshold-track"><i style={{ width: `${state.preferences.minimumMatch}%` }} /></div><button className="text-button" onClick={() => setView('preferences')}>Adjust preferences<ArrowRight size={13} /></button></section>
            <section className="rail-section activity"><div className="rail-heading"><h3>Workspace activity</h3><span className="live-dot" /></div>{state.jobs.length ? <div className="timeline">{[...state.jobs].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 3).map(job => <div key={job.id} className="timeline-item"><span className={`timeline-icon ${job.draftId ? 'complete' : ''}`}>{job.draftId ? <Check size={12} /> : <ArrowDownToLine size={12} />}</span><div><strong>{job.draftId ? 'Draft ready for review' : 'Opportunity imported'}</strong><p>{job.company} · {job.title}</p><small>{dateLabel(job.importedAt)}</small></div></div>)}</div> : <p className="muted small">Your imports and drafts will appear here.</p>}</section>
            <div className="rail-footnote"><ShieldCheck size={14} /><span>Your data stays on this device.<br />Your next move stays yours.</span></div>
          </aside></div>
          <div className="bottom-note"><ShieldCheck size={14} />Made for thoughtful applications, not mass sending.<span>Draft. Review. Apply.</span></div>
        </>}

        {view === 'documents' && <section className="content-section">
          <div className="section-heading"><div><h2>Uploaded job documents <span className="count-pill">{jobDocuments.length}</span></h2><p>PDF and DOCX uploads grouped by filename</p></div></div>
          {!jobDocuments.length ? <div className="empty-state"><FolderOpen size={32} /><h3>No uploaded job documents</h3><p>Your uploaded job PDFs and DOCX files will appear here.</p><button className="button primary" disabled={!!busy} onClick={() => void importDocuments(false)}><Upload size={16} />Upload job documents</button></div> : <div className="resume-grid">
            {jobDocuments.map(document => <article className="resume-card" key={document.source}>
              <div className="resume-card-top"><span className="document-icon"><FileText size={25} /></span><button className="icon-button danger" title={`Remove ${document.source}`} disabled={!!busy} onClick={() => setDocumentSource(document.source)}><Trash2 size={17} /></button></div>
              <h3>{document.source}</h3><p>{document.jobs} extracted {document.jobs === 1 ? 'job' : 'jobs'} · Imported {dateLabel(document.importedAt)}</p>
              {!!document.drafts && <span className="draft-badge ready"><Mail size={12} />{document.drafts} Gmail draft records</span>}
            </article>)}
          </div>}
          <div className="inline-note"><ShieldCheck size={18} /><p>Removing a document deletes its extracted jobs from this workspace, not the original file on your computer. Resumes and Gmail drafts are not deleted. Repeated uploads with the same filename are grouped together.</p></div>
        </section>}

        {view === 'resumes' && <section className="content-section"><div className="section-heading"><div><h2>Resume library <span className="count-pill">{state.resumes.length}</span></h2><p>PDF and DOCX · 10 MB per document</p></div></div>{!state.resumes.length ? <div className="empty-state"><FileText size={32} /><h3>A resume for every version of you.</h3><p>Upload one or more resumes to start matching.</p><button className="button primary" disabled={!!busy} onClick={() => void importDocuments(true)}><Upload size={16} />Upload resumes</button></div> : <div className="resume-grid">{state.resumes.map(resume => <article className="resume-card" key={resume.id}><div className="resume-card-top"><span className="document-icon"><FileText size={25} /></span><button className="icon-button danger" title={`Delete ${resume.name}`} disabled={!!busy} onClick={() => { if (confirm(`Remove ${resume.name}? Existing Gmail drafts will not be deleted.`)) void run('Removing resume', async () => { setState(await api.removeResume(resume.id)); }); }}><Trash2 size={16} /></button></div><h3>{resume.name}</h3><p>Added {dateLabel(resume.importedAt)} · {resume.years === null ? 'Experience not specified' : `${resume.years} years experience`}</p><div className="tags green-tags">{resume.skills.slice(0, 8).map(skill => <span key={skill}>{skill}</span>)}</div><details><summary>Extracted resume text</summary><pre>{resume.text}</pre></details></article>)}</div>}</section>}

        {view === 'template' && <form className="settings-layout" onSubmit={saveSettings}><section className="settings-main"><div className="section-heading"><div><h2>Your introduction</h2><p>Used for new drafts. Existing Gmail drafts stay unchanged.</p></div></div><label className="field-label">Applicant name<input required value={settings.applicantName} maxLength={120} onChange={event => setSettings({ ...settings, applicantName: event.target.value })} placeholder="Your full name" /></label><label className="field-label">Email template<textarea className="template-input" required minLength={20} maxLength={10000} value={settings.template} onChange={event => setSettings({ ...settings, template: event.target.value })} /></label><button className="button primary" disabled={!!busy}><Check size={16} />Save template</button></section><aside className="settings-aside"><h3>Personalization fields</h3><p className="muted small">Available template values</p>{['jobTitle', 'company', 'location', 'name', 'resumeName', 'skillsSummary', 'experienceSummary'].map(key => <code key={key}>{`{{${key}}}`}</code>)}<div className="inline-note"><ShieldCheck size={18} /><p>Skills and experience summaries use evidence from the selected resume, not unsupported claims.</p></div></aside></form>}

        {view === 'preferences' && <form className="settings-layout" onSubmit={saveSettings}>
          <section className="settings-main"><div className="section-heading"><div><h2>Your ideal next move</h2><p>Changes recalculate your current job matches.</p></div></div>
            <label className="field-label">Your name<input required maxLength={120} value={settings.applicantName} onChange={event => setSettings({ ...settings, applicantName: event.target.value })} placeholder="Your full name" /></label>
            <label className="field-label">Preferred locations<input defaultValue={settings.locations.join(', ')} onChange={event => setSettings({ ...settings, locations: splitList(event.target.value) })} placeholder="Remote, London, New York" /><small>Comma-separated. Leave blank for any location.</small></label>
            <label className="field-label">Preferred skills<input defaultValue={settings.skills.join(', ')} onChange={event => setSettings({ ...settings, skills: splitList(event.target.value) })} placeholder="Selenium, Playwright, Katalon" /><small>Comma-separated tools or skills.</small></label>
            <MatchModeControl label="Preferred skills match" name="preferred-skills-mode" value={settings.skillMatchMode ?? 'any'} disabled={!!busy} onChange={skillMatchMode => setSettings({ ...settings, skillMatchMode })} />
            <label className="field-label">Minimum match percentage <span className="range-value">{settings.minimumMatch}%</span><input type="range" min={0} max={100} step={1} value={settings.minimumMatch} onChange={event => setSettings({ ...settings, minimumMatch: Number(event.target.value) })} /><div className="range-labels"><span>0%</span><span>100%</span></div></label>
            <button className="button primary" disabled={!!busy}><Check size={16} />Save preferences</button>
          </section>
          <aside className="settings-aside"><h3>Transparent by design</h3><p className="muted small">Resume selection first compares evidence for the job's relevant focus tools, then overall fit. Filenames are not evidence.</p><div className="weight-row"><span>Resume skill coverage</span><strong>70%</strong></div><div className="weight-row"><span>Focus skill match</span><strong>10%</strong></div><div className="weight-row"><span>Location preference</span><strong>10%</strong></div><div className="weight-row"><span>Experience evidence</span><strong>10%</strong></div><div className="inline-note"><CircleHelp size={18} /><p>Any (OR) accepts one listed skill or more. All (AND) requires every listed skill. The minimum score still applies; scores are guidance, not hiring predictions.</p></div></aside>
        </form>}
      </main>
    </div>

    {removalDocument && <ModalFrame title="Remove job document?" close={() => !busy && setDocumentSource(null)}>
      <div className="modal-body"><h3>{removalDocument.source}</h3><p className="muted small">Remove {removalDocument.jobs} extracted {removalDocument.jobs === 1 ? 'job' : 'jobs'} from this workspace?</p>
        <div className="inline-note"><ShieldCheck size={18} /><p>Your original PDF/DOCX file and resumes stay unchanged. {removalDocument.drafts ? `${removalDocument.drafts} local draft records will also be removed, but the drafts themselves remain in Gmail.` : 'Any existing Gmail drafts remain in Gmail.'}</p></div>
        <div className="modal-actions"><button className="button subtle" disabled={!!busy} onClick={() => setDocumentSource(null)}>Cancel</button><button className="button primary" disabled={!!busy} onClick={() => void run('Removing job document', async () => {
          const next = await api.removeJobDocument(removalDocument.source);
          setState(next);
          setSelected(current => current.filter(id => next.jobs.some(job => job.id === id)));
          setDocumentSource(null);
          setToast({ text: `Removed ${removalDocument.jobs} ${removalDocument.jobs === 1 ? 'job' : 'jobs'} from ${removalDocument.source}. Original files and Gmail drafts were not deleted.`, error: false });
        })}><Trash2 size={15} />Remove document</button></div>
      </div>
    </ModalFrame>}

    {busy && <div className="busy-indicator" role="status"><LoaderCircle size={16} className="spin" />{busy}...</div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={20} /> : <CircleCheck size={20} />}<span>{toast.text}</span><button className="icon-button" title="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}

    {modal === 'import' && <ModalFrame title="Bring in your next opportunities" close={() => !busy && setModal(null)}><div className="modal-body"><div className="import-options"><button disabled={!!busy} onClick={() => void importDocuments(false)}><span className="document-icon"><Upload size={25} /></span><strong>Upload job descriptions</strong><span>PDF or DOCX · Up to 30 files</span><ArrowUpRight size={17} /></button><button disabled={!!busy} onClick={() => setModal('gmail')}><span className="document-icon gmail"><Mail size={25} /></span><strong>Import from Gmail</strong><span>Email content and attachments</span><ArrowUpRight size={17} /></button></div><div className="or-divider"><span>or paste a description</span></div><form onSubmit={event => { event.preventDefault(); void run('Extracting job', async () => { setState(await api.addJob(paste)); setPaste(''); setModal(null); setToast({ text: 'Job imported and matched to your resumes.', error: false }); }); }}><label className="field-label">Job description<textarea value={paste} onChange={event => setPaste(event.target.value)} required minLength={20} maxLength={200000} rows={7} placeholder={'Job Title: Frontend Engineer\nCompany: Acme\nLocation: Remote\nRequired skills: React, TypeScript\nExperience: 3 years experience\nApply: careers@acme.com'} /></label><button className="button primary" disabled={!!busy || paste.trim().length < 20}><Sparkles size={16} />Extract & match</button></form></div></ModalFrame>}

    {modal === 'gmail' && <ModalFrame title="Your Gmail connection" close={closeGmail}>
      <div className="modal-body">
        <div className="connection-banner"><Mail size={28} /><div><strong>{state.connectedEmail || 'Connect your Gmail account'}</strong><span>{state.connectedEmail ? 'Read emails. Save drafts. Stay in control.' : 'Secure Google OAuth · No password stored'}</span></div></div>
        {!state.connectedEmail ? <GmailSetup configured={!!state.oauthClientId} clientId={state.oauthClientId} project={state.oauthProject} busy={!!busy} signingIn={signingIn} onCancel={closeGmail}
          onOpen={step => void run('Opening Google setup', async () => api.openGoogleSetup(step))}
          onImport={() => void run('Setting up Google sign-in', async () => { const attempt = ++gmailAttempt.current; const next = await api.importOAuth(); if (!next || attempt !== gmailAttempt.current) return; setState(next); if (next.oauthClientId) await finishGoogleSignIn(next.oauthClientId, attempt); })}
          onSignIn={() => void run('Waiting for Google sign-in', async () => { await finishGoogleSignIn(state.oauthClientId, ++gmailAttempt.current); })}
        /> : <GmailSearchForm value={query} busy={!!busy} onChange={setQuery}
          onSearch={() => void run('Searching Gmail', async () => {
            const result = await api.fetchEmails(query);
            const next = await refresh();
            setLatestSearchOnly(true); setSourceFilter('gmail'); setFilter('all'); setSearch(''); setSelected([]); setView('dashboard'); setModal(null);
            const count = next.lastGmailSearch?.jobIds.length ?? result.added;
            setToast({ text: `${count} ${count === 1 ? 'job' : 'jobs'} found; ${result.added} newly imported.${result.errors.length ? ` ${result.errors.join(' ')}` : ''}`, error: result.errors.length > 0 });
          })}
          onDisconnect={() => { if (confirm('Disconnect Gmail and revoke access? Your existing drafts will remain in Gmail.')) void run('Disconnecting Gmail', async () => setState(await api.disconnect())); }}
        />}
      </div>
    </ModalFrame>}

    {modal === 'batch' && <ModalFrame title="Create your application drafts" close={() => !busy && setModal(null)}><div className="modal-body"><div className="batch-summary"><span className="empty-icon"><Mail size={28} /></span><h3>{batchIds.length} personalized {batchIds.length === 1 ? 'introduction' : 'introductions'}</h3><p>Each draft includes the selected resume as an attachment.</p></div><div className="batch-list">{state.jobs.filter(job => batchIds.includes(job.id)).map(job => <div key={job.id}><div><strong>{job.title}</strong><span>{job.company} · {job.recipient || 'Missing recipient - review required'}</span></div><span className="score high">{job.score}%</span></div>)}</div><div className="inline-note"><ShieldCheck size={20} /><p>These will be saved to Gmail Drafts, not sent. Review recipients and email content in Gmail before applying. Existing drafts are skipped.</p></div><div className="modal-actions"><button className="button subtle" disabled={!!busy} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={!!busy || !batchIds.length} onClick={() => void run('Creating Gmail drafts', async () => { const result = await api.createDrafts(batchIds); await refresh(); const message = `Ready to apply for ${result.created} ${result.created === 1 ? 'job' : 'jobs'}. ${result.failed} failed; ${result.skipped} skipped. Nothing was sent.`; setCompletion(message); setToast({ text: message, error: result.failed > 0 }); setSelected([]); setModal(null); })}><Mail size={16} />Create {batchIds.length} drafts</button></div></div></ModalFrame>}

    {currentJob && <ModalFrame title="Opportunity details" wide close={() => !busy && setJobId(null)}><div className="job-detail-heading"><span className="company-logo logo-0">{currentJob.company[0]}</span><div><h2>{currentJob.title}</h2><p>{currentJob.company} · {currentJob.location}</p></div><span className={`detail-score ${currentJob.score >= state.preferences.minimumMatch ? 'high' : ''}`}>{currentJob.score}%<small>match</small></span></div><div className="tabs detail-tabs"><button className={detailTab === 'overview' ? 'selected' : ''} onClick={() => setDetailTab('overview')}>Job & match</button><button className={detailTab === 'draft' ? 'selected' : ''} onClick={() => setDetailTab('draft')}>Email preview</button></div><div className="modal-body">{currentJob.error && <div className="error-inline" role="alert">{currentJob.error}</div>}{detailTab === 'overview' ? <><div className="detail-grid"><form onSubmit={event => { event.preventDefault(); void run('Saving job details', async () => { const next = await api.updateJob(currentJob.id, fieldEdits); setState(next); if (currentJob.resumeId) setPreview(await api.preview(currentJob.id)); setToast({ text: 'Job details updated.', error: false }); }); }}><h3>Extracted details</h3>{(['title', 'company', 'location', 'recipient'] as const).map(key => <label className="field-label" key={key}>{key === 'recipient' ? 'Recruiter email - review before drafting' : key[0].toUpperCase() + key.slice(1)}<input type={key === 'recipient' ? 'email' : 'text'} required={key !== 'recipient'} value={fieldEdits[key]} onChange={event => setFieldEdits({ ...fieldEdits, [key]: event.target.value })} /></label>)}<button className="button subtle" disabled={!!busy}><Check size={14} />Save corrections</button></form><div className="match-explanation"><h3>Why this match?</h3>{currentJob.reasons.map(reason => <p key={reason}><Check size={14} />{reason}</p>)}<h4>Evidenced skills</h4><div className="tags green-tags">{currentJob.matchedSkills.map(skill => <span key={skill}>{skill}</span>)}</div>{!!currentJob.missingSkills.length && <><h4>Not evidenced</h4><div className="tags missing-tags">{currentJob.missingSkills.map(skill => <span key={skill}>{skill}</span>)}</div></>}<h4>Experience required</h4><p>{currentJob.years === null ? 'Not specified' : `${currentJob.years}+ years`}</p><h4>Selected resume</h4><p className="selected-resume"><FileText size={15} />{state.resumes.find(resume => resume.id === currentJob.resumeId)?.name || 'Upload a resume to match'}</p></div></div><details className="source-text"><summary>Original job description · {currentJob.source}</summary><pre>{currentJob.text}</pre></details></> : preview ? <div className="email-preview"><div className="email-header"><span>To</span><strong>{preview.recipient || 'No recipient - add a recruiter email in Job & match'}</strong></div><div className="email-header"><span>Subject</span><strong>{preview.subject}</strong></div><pre>{preview.body}</pre><div className="attachment"><FileText size={20} /><span>{state.resumes.find(resume => resume.id === currentJob.resumeId)?.name}</span><Check size={15} /></div><p className="muted small">Preview uses current settings. An existing Gmail draft is not changed by edits here.</p></div> : <div className="empty-state"><FileText size={28} /><h3>Add a resume first</h3><p>A resume is required for a personalized email preview.</p></div>}<div className="modal-actions"><button className="button text-danger" disabled={!!busy} onClick={() => { if (confirm('Remove this opportunity? Existing Gmail drafts will remain.')) void run('Removing job', async () => { setState(await api.deleteJob(currentJob.id)); setJobId(null); }); }}><Trash2 size={14} />Remove job</button>{currentJob.draftId ? <button className="button primary" onClick={() => void run('Opening Gmail', async () => api.openDrafts())}><ArrowUpRight size={15} />Open Gmail drafts</button> : <button className="button primary" disabled={!!busy || !currentJob.resumeId || currentJob.score < state.preferences.minimumMatch || !currentJob.recipient} onClick={() => { setSelected([currentJob.id]); setJobId(null); setModal('batch'); }}><Mail size={15} />Create draft</button>}</div></div></ModalFrame>}

    {modal === 'help' && <ModalFrame title="Workspace resources" close={() => setModal(null)}><div className="modal-body help-content"><h3>Before your first import</h3><ol><li>Add your resumes in My resumes.</li><li>Set your name, locations, and skills in Preferences.</li><li>Upload job descriptions or connect Gmail with your Google Desktop OAuth JSON.</li><li>Review extracted fields and recipients, then create drafts.</li></ol><h3>Your privacy & control</h3><p>Documents and tokens are encrypted on this device. Nothing is sent automatically. Completion notifications are free desktop alerts; enable them in your operating system settings.</p><h3>Gmail setup</h3><p>Enable the Gmail API in Google Cloud, configure an OAuth consent screen, add yourself as a test user, and create a Desktop app OAuth client. Import its downloaded JSON in the Gmail connection dialog.</p><h3>Document support</h3><p>Text-based PDF and DOCX files are supported. Scanned images require OCR before import. Extraction is deterministic and should be reviewed.</p><div className="inline-note"><FileText size={19} /><p>Full setup, packaging, security notes, architecture, and release checks are included in the repository documentation.</p></div></div></ModalFrame>}
  </div>;
}