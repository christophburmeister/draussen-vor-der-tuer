import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

// --- Config from environment ---
const IMMICH_URL = env('IMMICH_URL').replace(/\/$/, '');
const IMMICH_API_KEY = env('IMMICH_API_KEY');
const GALLERY_TITLE = process.env.GALLERY_TITLE ?? 'Galerie';
const ALBUM_ID = process.env.ALBUM_ID;
const ALBUM_NAME = process.env.ALBUM_NAME;

if (!ALBUM_ID && !ALBUM_NAME) {
  die('Setze ALBUM_ID oder ALBUM_NAME als Umgebungsvariable.');
}

function env(name) {
  const val = process.env[name];
  if (!val) die(`Umgebungsvariable ${name} fehlt.`);
  return val;
}

function die(msg) {
  console.error(`Fehler: ${msg}`);
  process.exit(1);
}

// --- Immich API helpers ---
async function immichFetch(path, opts = {}) {
  const res = await fetch(`${IMMICH_URL}${path}`, {
    ...opts,
    headers: { 'x-api-key': IMMICH_API_KEY, Accept: 'application/json', ...opts.headers },
  });
  if (!res.ok) die(`Immich API ${path} → HTTP ${res.status}`);
  return res;
}

async function immichJson(path) {
  const res = await immichFetch(path);
  return res.json();
}

async function resolveAlbumId() {
  if (ALBUM_ID) return ALBUM_ID;
  const albums = await immichJson('/api/albums');
  const match = albums.find(a => a.albumName === ALBUM_NAME);
  if (!match) die(`Album "${ALBUM_NAME}" nicht gefunden.`);
  console.log(`Album gefunden: "${match.albumName}" (${match.id})`);
  return match.id;
}

async function fetchAlbumAssets(albumId) {
  const assets = [];
  let page = 1;
  while (true) {
    const res = await immichFetch('/api/search/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumIds: [albumId], type: 'IMAGE', size: 1000, page }),
    });
    const data = await res.json();
    const items = data.assets?.items ?? [];
    assets.push(...items);
    const nextPage = data.assets?.nextPage;
    if (!nextPage || typeof nextPage !== 'number') break;
    page = nextPage;
  }
  return assets;
}

// --- Download helpers ---
async function downloadBinary(apiPath, destFile) {
  const res = await fetch(`${IMMICH_URL}${apiPath}`, {
    headers: { 'x-api-key': IMMICH_API_KEY, Accept: 'image/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(destFile));
}

const CONCURRENCY = 5;
async function pMap(items, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

// --- Main ---
async function main() {
  const albumId = await resolveAlbumId();

  console.log('Lade Album-Assets…');
  const images = (await fetchAlbumAssets(albumId))
    .sort((a, b) => new Date(b.fileCreatedAt) - new Date(a.fileCreatedAt));

  console.log(`${images.length} Bilder gefunden.`);

  // Prepare dist/
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'images'), { recursive: true });
  await mkdir(path.join(DIST, 'thumbs'), { recursive: true });
  await copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
  await copyFile(path.join(SRC, 'header.jpg'), path.join(DIST, 'header.jpg'));

  // Download images
  let done = 0;
  const failed = [];
  const succeeded = [];
  await pMap(images, async (asset) => {
    const thumbDest = path.join(DIST, 'thumbs', `${asset.id}.jpg`);
    const imageDest = path.join(DIST, 'images', `${asset.id}.jpg`);
    try {
      await Promise.all([
        downloadBinary(`/api/assets/${asset.id}/thumbnail?size=thumbnail`, thumbDest),
        downloadBinary(`/api/assets/${asset.id}/thumbnail?size=preview`, imageDest),
      ]);
      succeeded.push(asset);
    } catch (err) {
      failed.push({ asset, err });
    }
    done++;
    process.stdout.write(`\r  ${done}/${images.length}`);
  });
  if (failed.length) {
    console.log(`\nÜbersprungen (${failed.length} Fehler):`);
    for (const { asset, err } of failed) {
      console.warn(`  ${asset.id} (${asset.originalFileName}): ${err.message}`);
    }
  }
  console.log();

  // Build gallery items HTML
  const items = succeeded.map((asset) => {
    // width/height sind direkte Felder in dieser Immich-Version
    const w = asset.width ?? '';
    const h = asset.height ?? '';
    const sizeAttr = w && h ? ` data-lg-size="${w}-${h}"` : '';
    const alt = (asset.originalFileName ?? '').replace(/"/g, '&quot;');
    return (
      `<a href="images/${asset.id}.jpg"${sizeAttr}>\n` +
      `      <img src="thumbs/${asset.id}.jpg" alt="${alt}" loading="lazy" />\n` +
      `    </a>`
    );
  });

  const template = await readFile(path.join(SRC, 'template.html'), 'utf-8');
  const html = template
    .replace(/{{TITLE}}/g, GALLERY_TITLE)
    .replace('{{GALLERY_ITEMS}}', items.join('\n    '));

  await writeFile(path.join(DIST, 'index.html'), html, 'utf-8');
  console.log(`Fertig: dist/index.html mit ${succeeded.length} Fotos.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
