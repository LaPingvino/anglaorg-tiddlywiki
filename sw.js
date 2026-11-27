// angla.org's service worker. tools/pwa.mjs fills in VERSION (the built
// wiki's hash) and puts it beside index.html, so each published build installs
// a new worker, which takes over at once and drops the old caches.
//   - the wiki (one file, every page in it): network first, so a new build
//     or a save from ?redakti shows at the next load; the copy kept makes the
//     whole wiki work offline (any address of the site, ?redakti too);
//   - the fonts: Google's font files are named by content, so cache first;
//     their stylesheet network first;
//   - everything else, above all the editor's GitHub API calls and every
//     non-GET request: never touched, never kept.
const VERSION = "fe6fa81e65c5";
const WIKI = "angla-" + VERSION;
const FONTS = "angla-tiparoj";
const PAGE = "/";
const FILES = ["/manifest.webmanifest", "/ikono-192.png", "/ikono-512.png", "/ikono-maskable-192.png", "/ikono-maskable-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(WIKI).then((c) => c.addAll([PAGE, ...FILES])).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("angla-") && k !== WIKI && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

const ok = (r) => r && r.status === 200 && !r.redirected && (r.type === "basic" || r.type === "cors");

async function networkFirst(e, cache, key) {
  try {
    const res = await fetch(e.request);
    if (ok(res)) e.waitUntil(caches.open(cache).then((c) => c.put(key, res.clone())));
    return res;
  } catch (err) {
    const hit = await caches.match(key, { cacheName: cache });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(e, cache) {
  const hit = await caches.match(e.request, { cacheName: cache });
  if (hit) return hit;
  const res = await fetch(e.request);
  if (ok(res)) e.waitUntil(caches.open(cache).then((c) => c.put(e.request, res.clone())));
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.gstatic.com") e.respondWith(cacheFirst(e, FONTS));
    else if (url.hostname === "fonts.googleapis.com") e.respondWith(networkFirst(e, FONTS, req));
    return;
  }
  if (url.pathname === "/sw.js") return;
  if (req.mode === "navigate") {
    // The wiki is one page: whatever address (/, /?redakti, an old Hugo
    // URL the server redirects), offline it is the kept wiki. Only the
    // wiki itself is kept, not a redirect.
    const wiki = url.pathname === "/" || url.pathname === "/index.html";
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (wiki && ok(res)) e.waitUntil(caches.open(WIKI).then((c) => c.put(PAGE, res.clone())));
        return res;
      } catch (err) {
        const hit = await caches.match(PAGE, { cacheName: WIKI });
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
  if (FILES.includes(url.pathname)) e.respondWith(networkFirst(e, WIKI, url.pathname));
});
