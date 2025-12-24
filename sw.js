
const CACHE_NAME = 'daily-harmony-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching essential assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Supabase나 Gemini API, 폰트 요청은 캐시하지 않음
  if (
    event.request.url.includes('supabase.co') || 
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('gstatic.com') ||
    event.request.url.includes('esm.sh')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // 캐시된 응답이 있으면 반환하고, 없으면 네트워크에서 가져옴
      return response || fetch(event.request).catch(() => {
        // 네트워크 실패 시 인덱스 페이지 반환 (SPA 라우팅 대응)
        if (event.request.mode === 'navigate') {
          return caches.match('./');
        }
      });
    })
  );
});
