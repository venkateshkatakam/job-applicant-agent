import { FileText, Mail } from 'lucide-react';
import type { Job } from '../shared/types';

function emailDate(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Email date unavailable';
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function JobSource({ job }: { job: Job }) {
  const sources = job.emailSources ?? [];
  if (!sources.length) return <span className="job-source" title={job.source}><span><FileText size={11} />{job.source}</span>{job.source.startsWith('Gmail') && <small>Email metadata unavailable; sync again</small>}</span>;
  const source = sources[0];
  const emailCount = new Set(sources.map(origin => origin.messageId)).size;
  const details = sources.map(origin => `${origin.subject}\nFrom: ${origin.from}\nEmail date: ${emailDate(origin.receivedAt)}${origin.attachment ? `\nAttachment: ${origin.attachment}` : ''}`).join('\n\n');
  return <span className="job-source" title={details}><span><Mail size={11} />{source.subject || '(No email subject)'}{emailCount > 1 ? ` (+${emailCount - 1} emails)` : ''}</span><small>From: {source.from}</small><small>Email: {emailDate(source.receivedAt)}{source.attachment ? ` · ${source.attachment}` : ''}</small></span>;
}