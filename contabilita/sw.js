// Service worker minimo: serve solo a rendere l'app installabile sul telefono.
// Non salva in memoria nessun dato: ogni richiesta va sempre in diretta in rete.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* nessuna cache: comportamento normale del browser */ });
