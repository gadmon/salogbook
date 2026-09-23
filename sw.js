// SALOGBOOK Service Worker v4
const CACHE_NAME = 'salogbook-v4';

// External libraries the app has a hard dependency on just to boot (Supabase JS
// creates the client at the top of index.html's script - if it fails to load,
// nothing else in the app runs). Precached so a fully offline cold launch (e.g.
// opening the app in airplane mode) still works, not just a warm reload.
const PRECACHE_URLS = [
  '/salogbook/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

// Install - cache the app shell and its critical external dependencies
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch - only cache the app shell + critical CDN deps, pass everything else through
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Precached critical dependencies (currently just Supabase JS) - network first,
  // cached copy as the offline fallback, same strategy as the app shell below.
  if (PRECACHE_URLS.includes(event.request.url)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // NEVER intercept these - let them go straight to network
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    // Pass through to network - do NOT call event.respondWith()
    return;
  }

  // For the app itself - network first, so a new deploy is picked up on the very
  // next load, with the cached copy only used as an offline fallback. (Previously
  // this was cache-first, which meant a browser that had ever loaded the app kept
  // serving its first-ever cached index.html forever, even across new deployments -
  // that's why fixes shipped to the repo didn't reach users who'd already visited.)
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && event.request.mode === 'navigate') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/salogbook/index.html');
        }
      });
    })
  );
});
