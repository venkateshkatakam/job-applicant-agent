import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const application = await electron.launch({ args: [process.env.APP_EXECUTABLE ? '--no-sandbox' : '.'], ...(process.env.APP_EXECUTABLE ? { executablePath: process.env.APP_EXECUTABLE } : {}), env: { ...process.env, VITE_DEV_SERVER_URL: '' } });
try {
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'A better match. A better next step.' }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('.preview-bar').count(), 0, 'Desktop must never show browser sample data');
  const isolation = await page.evaluate(() => ({ api: typeof window.applicant?.load, node: typeof window.require, images: [...document.images].every(image => image.complete && image.naturalWidth > 0) }));
  assert.equal(isolation.api, 'function');
  assert.equal(isolation.node, 'undefined');
  assert.equal(isolation.images, true);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Python engineer. AWS. Five years of professional experience.', { x: 30, y: 700, font, size: 12 });
  const parsed = await application.evaluate(async ({ app }, bytes) => {
    const load = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
    const { extractDocument } = load('./dist-electron/electron/documents.js');
    return extractDocument('smoke.pdf', Buffer.from(bytes, 'base64'));
  }, Buffer.from(await pdf.save()).toString('base64'));
  assert.match(parsed, /Python engineer/);
  await page.getByRole('button', { name: 'My resumes', exact: true }).click();
  await page.getByRole('heading', { name: 'My resumes', exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop.png' });
  console.log('Desktop smoke passed: packaged assets, PDF worker extraction, preload API, isolation, real workspace, and navigation.');
} finally { await application.close(); }