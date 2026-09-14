// SALOGBOOK Service Worker v1
// Handles offline caching and background sync

const CACHE_NAME = 'salogbook-v1';
const OFFLINE_QUEUE_KEY = 'salogbook-offline-queue';

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Install - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.add('/index.html').catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - serve from cache when offline
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // For Supabase API calls - network first, fall through if offline
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return empty response for API calls when offline
        return new Response(JSON.stringify({data: null, error: {message: 'Offline'}}), {
          headers: {'Content-Type': 'application/json'}
        });
      })
    );
    return;
  }

  // For the app itself - cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for the app shell
        if (response.ok && (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Return cached index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Background sync when connection restored
self.addEventListener('sync', event => {
  if (event.tag === 'sync-flights') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  // Notify all clients to sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({type: 'SYNC_NEEDED'}));
}
