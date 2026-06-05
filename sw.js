// Service Worker — Чек-лист магазина v3
// ============================================

const CACHE_NAME = 'checklist-v4';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './employee.html',
  './admin.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/theme.js',
  './js/employee.js',
  './js/admin.js',
  './js/pwa-install.js',
  './manifest.json',
  './icons/pwa_logo.png'
];

// Установка — кэшируем статические файлы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширование файлов');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Активация — удаляем старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME)
              .map(key => {
                console.log('[SW] Удаление старого кэша:', key);
                return caches.delete(key);
              })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-запросы (Supabase, Telegram) — ТОЛЬКО сеть, без кэша
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('api.telegram.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({
          success: false,
          error: 'Нет подключения к интернету'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Google Fonts — кэшируем при первой загрузке
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          });
        })
    );
    return;
  }

  // Все локальные ресурсы (HTML, CSS, JS) — СЕТЬ в первую очередь, кэш как фоллбэк
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'));
      })
  );
});
