// SALOGBOOK Service Worker v2
const CACHE_NAME = 'salogbook-v2';

// Install - cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add('/salogbook/index.html').catch(() => {}))
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

// Fetch - only cache the app shell, pass everything else through
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

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

  // For the app itself - cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/salogbook/index.html');
        }
      });
    })
  );
});
