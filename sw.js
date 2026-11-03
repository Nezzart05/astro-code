/* Astro Code — Service Worker : rend l'app installable (PWA) et accélère les visites suivantes.
   Stratégie v1.6.0 : CODE (HTML/JS/CSS) en network-first — les correctifs
   arrivent dès la visite suivante ; MÉDIAS lourds (vidéo, cibles, images)
   en cache-first pour la vitesse. Le nom de cache change à CHAQUE
   livraison : c'est ce qui force les téléphones à abandonner l'ancien code. */
const CACHE = 'astro-code-v1.9.112';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './ar-tracking.js',
  './reveal-2d.js',
  './fusion.js',
  './record-share.js',
  './memory.js',
  './app.js',
  './game.js',
  './map.js',
  './meta-ai.js',
  './targets.mind',
  './assets/brand/logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Ne jamais mettre en cache les appels API / fonctions serverless : toujours le réseau.
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;

  const isCode = e.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('/');

  if (isCode && url.origin === self.location.origin) {
    // NETWORK-FIRST pour le code : on sert le frais quand le réseau répond,
    // le cache seulement en secours (hors-ligne). Chaque réponse fraîche
    // met le cache à jour — fini les anciennes versions servies indéfiniment.
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // CACHE-FIRST pour les médias et le reste (vidéo, cibles .mind, images…).
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
