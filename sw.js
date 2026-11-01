/**
 * App Pádel – service worker
 *
 * Estrategia «red primero»: siempre intenta descargar la versión publicada y guarda una copia.
 * Solo si no hay conexión sirve la copia guardada. Así cada despliegue de Netlify llega al momento
 * y la app sigue abriendo sin cobertura.
 *
 * Solo toca los archivos de la propia web. Las llamadas a Apps Script (lectura y escritura de datos)
 * pasan sin tocar: los datos ya se guardan en localStorage desde index.html.
 *
 * Si algún día cambia la lista de archivos básicos, sube la versión de CACHE.
 */

const CACHE = 'padel6-v1';
const BASICOS = [
  './',
  'index.html',
  'logica.js',
  'manifest.webmanifest',
  'icono.svg',
  'icono-192.png',
  'icono-512.png',
  'icono-maskable-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(BASICOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (guardada) {
          if (guardada) return guardada;
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        });
      })
  );
});
