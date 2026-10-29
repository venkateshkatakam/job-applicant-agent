import { createCanvas, loadImage } from '@napi-rs/canvas';
import pngToIco from 'png-to-ico';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const resources = path.join(root, 'resources');
const image = await loadImage(await readFile(path.join(root, 'public/mark.svg')));
await mkdir(resources, { recursive: true });

function render(size) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}

await writeFile(path.join(resources, 'icon.png'), render(1024));
await writeFile(path.join(resources, 'icon.ico'), await pngToIco([16, 24, 32, 48, 64, 128, 256].map(render)));

if (process.platform === 'darwin') {
  const temporary = await mkdtemp(path.join(tmpdir(), 'applicant-icons-'));
  try {
    const iconset = path.join(temporary, 'icon.iconset');
    await mkdir(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      await writeFile(path.join(iconset, `icon_${size}x${size}.png`), render(size));
      await writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2));
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'icon.icns')]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
} else {
  console.log('ICNS generation requires macOS; retain the committed resources/icon.icns for Mac builds.');
}

console.log('Native icons generated from public/mark.svg.');