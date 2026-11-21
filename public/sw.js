const CACHE_NAME = 'esamsat-jatim-v1';
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clientsClaim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST') {
    event.respondWith(async function () {
      try {
        const formData = await event.request.formData();
        const imageFile = formData.get('image');
        if (imageFile) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/shared-image', new Response(imageFile));
        }
      } catch (e) {
        console.error('Share target error:', e);
      }
      return Response.redirect('/?share=true', 303);
    }());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
