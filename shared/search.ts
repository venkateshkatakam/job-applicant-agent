import type { EmailQuery } from './types.js';

export function buildGmailQuery(query: EmailQuery): string {
  const terms = [...new Set((query.terms ?? []).map(term => term.trim()).filter(Boolean))];
  if (terms.some(term => /["\\{}()\r\n]/.test(term))) throw new Error('Use plain keywords in search terms; put Gmail operators in Advanced Gmail search.');
  const parts: string[] = [];
  if (terms.length) parts.push(`(${terms.map(term => `"${term}"`).join(query.matchMode === 'all' ? ' ' : ' OR ')})`);
  if (query.query.trim()) parts.push(`(${query.query.trim()})`);
  if (query.after) parts.push(`after:${Math.floor(new Date(`${query.after}T00:00:00`).getTime() / 1000)}`);
  if (query.before) {
    const end = new Date(`${query.before}T00:00:00`);
    end.setDate(end.getDate() + 1);
    parts.push(`before:${Math.floor(end.getTime() / 1000)}`);
  }
  return parts.join(' ');
}