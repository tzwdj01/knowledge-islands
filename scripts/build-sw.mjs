import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const files = []
const manifestHash = crypto.createHash('sha256')
const visit = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(full)
    else if (entry.name !== 'sw.js' && entry.name !== '.DS_Store') {
      const url = '/' + path.relative(dist, full).replaceAll(path.sep, '/')
      files.push(url)
      manifestHash.update(url).update('\0').update(fs.readFileSync(full))
    }
  }
}
visit(dist)
const contentHash = manifestHash.digest('hex').slice(0, 12)
const indexPath = path.join(dist, 'index.html')
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('</head>', `<meta name="offline-version" content="${contentHash}"></head>`))
const sw = `const CACHE = 'knowledge-islands-${contentHash}';
const VERSION = '${contentHash}';
const FILES = ${JSON.stringify(files)};
const ROOT = new URL('./', self.registration.scope).pathname;
const asset = (p) => new URL(p.slice(1), self.registration.scope).toString();
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (let i = 0; i < FILES.length; i += 12) {
      await Promise.all(FILES.slice(i, i + 12).map(async p => {
        const response = await fetch(asset(p), { cache: 'reload' });
        if (!response.ok) throw new Error('离线资源下载失败: ' + p);
        await cache.put(asset(p), response);
      }));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k.startsWith('knowledge-islands-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'OFFLINE_READY', version: VERSION }));
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return (await caches.match(asset('/index.html'))) || Response.error();
      throw error;
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CHECK_OFFLINE') {
    caches.open(CACHE).then(async cache => {
      const ready = (await Promise.all(FILES.map(p => cache.match(asset(p))))).every(Boolean);
      event.source?.postMessage({ type: 'OFFLINE_STATUS', ready, version: VERSION });
    });
  }
});
`
fs.writeFileSync(path.join(dist, 'sw.js'), sw)
console.log(`PWA 离线资源 ${files.length} 个，缓存版本 ${contentHash}`)
