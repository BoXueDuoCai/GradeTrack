// 简单 service worker - 缓存静态资源
const CACHE_NAME = 'score-app-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 网络优先，失败回退缓存
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // 不缓存 API 请求
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功则缓存副本
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
  );
});
