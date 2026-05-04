// Service Worker para proxy sin iframes
const WORKER_URL = 'https://search.mathssupport.cat';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Si la petición es a nuestro propio Worker, dejarla pasar (evitar bucle)
  if (url.origin === 'https://search.mathssupport.cat') {
    event.respondWith(fetch(request));
    return;
  }
  
  // Si es una petición al mismo origen (browse.mathssupport.cat) pero no es la página principal,
  // eso significa que el navegador intenta cargar recursos del proxy (CSS, JS, etc.) que el Worker reescribió.
  // Debemos redirigirlas al Worker también.
  if (url.origin === self.location.origin) {
    // Si es la raíz o index.html, devolver el HTML principal (para que el SW controle la página)
    if (url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(fetch(request));
      return;
    }
    // Para otros recursos (CSS, JS, imágenes) relativos que el HTML del proxy pide,
    // los redirigimos al Worker con la URL completa (que debería ser la URL original)
    // Pero el HTML ya debería haber reescrito esas URLs para que apunten a search.mathssupport.cat/?url=...
    // Así que este caso no debería darse. No obstante, lo dejamos pasar.
    event.respondWith(fetch(request));
    return;
  }
  
  // Para cualquier otra petición (navegación o recursos), la redirigimos al Worker
  // Esto incluye clics en enlaces que el HTML no reescribió, o recursos dinámicos.
  event.respondWith(
    fetch(`${WORKER_URL}/?url=${encodeURIComponent(request.url)}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual'
    })
  );
});
