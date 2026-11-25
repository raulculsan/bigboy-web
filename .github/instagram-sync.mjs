// Copies the latest posts of @thebigboyrules into the website: the photos go to
// fotos/instagram/<id>.jpg and the list to instagram.json, so the carrete is served
// by GitHub Pages (Instagram's own image links expire after a few days).
// Runs from .github/workflows/instagram.yml in the website repo. Node 20+, no packages.
//   IG_TOKEN    access token. With IG_USER_ID: a never-expiring system-user token from the
//               business portfolio (Graph API, permission instagram_basic). Without it: an
//               Instagram-login token (graph.instagram.com, refreshed weekly below)
//   IG_USER_ID  Instagram account ID in the business portfolio (17841455562961211)
//   OUT         website folder (default: current folder)
//   IG_KEEP     how many posts to keep (default 36)
//   IG_API      API base, only for tests (default https://graph.instagram.com)
//   TOKEN_FILE  if set, a refreshed token is written there so the workflow can store it
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const token = process.env.IG_TOKEN;
if (!token) { console.error('Falta IG_TOKEN.'); process.exit(1); }
const out = process.env.OUT || '.';
const keep = Number(process.env.IG_KEEP || 36);
const userId = process.env.IG_USER_ID || '';
const api = (process.env.IG_API || (userId ? 'https://graph.facebook.com/v21.0' : 'https://graph.instagram.com')).replace(/\/$/, '');
const dir = join(out, 'fotos', 'instagram');

const get = async url => {
  const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${response.status} en ${url.split('?')[0]}: ${(await response.text()).slice(0, 300)}`);
  return response;
};

// Width and height from a JPEG's start-of-frame marker.
export function jpegSize(buffer) {
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const marker = buffer[i + 1];
    const length = buffer.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {alto: buffer.readUInt16BE(i + 5), ancho: buffer.readUInt16BE(i + 7)};
    i += 2 + length;
  }
  return null;
}

async function main() {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
  const posts = [];
  let next = `${api}/${userId || 'me'}/media?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`;
  while (next && posts.length < keep) {
    const page = await (await get(next)).json();
    posts.push(...(page.data || []));
    next = page.paging?.next || null;
  }

  await mkdir(dir, {recursive: true});
  const have = new Set(await readdir(dir));
  const previous = JSON.parse(await readFile(join(out, 'instagram.json'), 'utf8').catch(() => '{"posts":[]}'));
  const known = new Map(previous.posts.map(p => [p.id, p]));
  const list = [];
  for (const post of posts.slice(0, keep)) {
    const file = `${post.id}.jpg`;
    // Carousels show their first picture; videos and reels show their cover.
    const first = post.media_type === 'CAROUSEL_ALBUM' ? (post.children?.data?.[0] || post) : post;
    const image = first.media_type === 'VIDEO' ? first.thumbnail_url : first.media_url;
    if (!image) continue;
    let size = known.get(post.id);
    if (!have.has(file) || !size?.ancho) {
      const buffer = Buffer.from(await (await get(image)).arrayBuffer());
      await writeFile(join(dir, file), buffer);
      size = jpegSize(buffer) || {ancho: 1080, alto: 1350};
    }
    list.push({
      id: post.id,
      src: `fotos/instagram/${file}`,
      ancho: size.ancho, alto: size.alto,
      texto: String(post.caption || '').slice(0, 600),
      enlace: post.permalink,
      fecha: post.timestamp,
      video: first.media_type === 'VIDEO',
    });
  }
  const wanted = new Set(list.map(p => `${p.id}.jpg`));
  for (const name of have) if (name.endsWith('.jpg') && !wanted.has(name)) await rm(join(dir, name));

  const changed = JSON.stringify(list) !== JSON.stringify(previous.posts);
  if (changed) await writeFile(join(out, 'instagram.json'), `${JSON.stringify({cuenta: 'thebigboyrules', actualizado: new Date().toISOString(), posts: list}, null, 1)}\n`);
  console.log(changed ? `Carrete actualizado: ${list.length} publicaciones.` : 'Sin publicaciones nuevas.');

  // Long-lived tokens last 60 days; refreshing extends them. Once a week is plenty.
  if (!userId && process.env.TOKEN_FILE && new Date().getUTCDay() === 1 && new Date().getUTCHours() < 6) {
    const fresh = await (await get(`${api}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)).json();
    if (fresh.access_token) { await writeFile(process.env.TOKEN_FILE, fresh.access_token, {mode: 0o600}); console.log('Token renovado.'); }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exit(1); });
