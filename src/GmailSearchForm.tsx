import { useState } from 'react';
import { ArrowDownToLine, RotateCcw } from 'lucide-react';
import type { EmailQuery } from '../shared/types';
import { buildGmailQuery } from '../shared/search';
import { MatchModeControl } from './MatchModeControl';

interface Props { value: EmailQuery; busy: boolean; onChange(value: EmailQuery): void; onSearch(): void; onDisconnect(): void }

export function GmailSearchForm({ value, busy, onChange, onSearch, onDisconnect }: Props) {
  const [terms, setTerms] = useState(value.terms?.join(', ') ?? '');
  let preview = '';
  let error = '';
  try { preview = buildGmailQuery(value); } catch (failure) { error = (failure as Error).message; }
  return <form onSubmit={event => { event.preventDefault(); if (!error) onSearch(); }}>
    <div className="date-grid"><label className="field-label">From date<input type="date" value={value.after} max={value.before || undefined} onChange={event => onChange({ ...value, after: event.target.value })} /></label><label className="field-label">Through date<input type="date" min={value.after || undefined} value={value.before} onChange={event => onChange({ ...value, before: event.target.value })} /></label></div>
    <label className="field-label">Search terms<input value={terms} disabled={busy} onChange={event => { setTerms(event.target.value); onChange({ ...value, terms: [...new Set(event.target.value.split(',').map(term => term.trim()).filter(Boolean))] }); }} placeholder="Selenium, Playwright, REST Assured" /><small>Comma-separated words or phrases.</small></label>
    <MatchModeControl label="Gmail search match" name="gmail-search-mode" value={value.matchMode ?? 'any'} disabled={busy} onChange={matchMode => onChange({ ...value, matchMode })} />
    <label className="field-label">Advanced Gmail search<input value={value.query} disabled={busy} maxLength={500} onChange={event => onChange({ ...value, query: event.target.value })} placeholder="from:recruiter@example.com" /><small>Optional Gmail operators. Dates are inclusive; maximum 200 emails per search.</small></label>
    {error ? <p className="error-inline" role="alert">{error}</p> : <details className="query-preview"><summary>Gmail query preview</summary><code>{preview || 'All emails (up to 200)'}</code></details>}
    <div className="search-form-actions"><button type="button" className="button subtle" disabled={busy} onClick={() => { setTerms(''); onChange({ after: '', before: '', query: '', terms: [], matchMode: 'any' }); }}><RotateCcw size={15} />Reset search</button><button className="button primary" disabled={busy || !!error}><ArrowDownToLine size={16} />Search Gmail</button></div>
    <div className="modal-actions"><button type="button" className="button text-danger" disabled={busy} onClick={onDisconnect}>Disconnect Gmail</button><span className="muted small">Existing jobs and drafts are preserved.</span></div>
  </form>;
}