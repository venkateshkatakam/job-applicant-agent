import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'node:path';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export async function extractDocument(name: string, buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 10 MB limit.');
  const extension = path.extname(name).toLowerCase();
  let text: string;
  if (extension === '.pdf') {
    const parser = new PDFParse({ data: buffer, isEvalSupported: false });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (extension === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else throw new Error('Choose a PDF or DOCX document.');
  if (text.trim().length < 20) throw new Error('No readable text found. Scanned PDFs require OCR before import.');
  if (text.length > 200_000) throw new Error('Document is too long. Use a focused job description or resume.');
  return text.trim();
}