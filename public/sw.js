const CACHE = 'promotor-app-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/components.css',
  './assets/logo-jet.svg',
  './js/state.js',
  './js/config.js',
  './js/api.js',
  './js/ui.js',
  './js/auth.js',
  './js/slot.js',
  './js/operacao.js',
  './js/solicitacoes.js',
  './js/vendas.js',
  './js/mapa.js',
  './js/historico.js',
  './js/router.js',
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // API calls: network only (não cachear respostas de API)
  if (evt.request.url.includes('/app/query') || evt.request.url.includes('/app/event')) {
    evt.respondWith(fetch(evt.request).catch(() =>
      new Response(JSON.stringify({ ok: false, mensagem: 'Sem conexão.' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }
  // Assets: cache first
  evt.respondWith(caches.match(evt.request).then((hit) => hit || fetch(evt.request)));
});
