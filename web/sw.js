// Service worker Ulysse — RÉSEAU D'ABORD (exigence Raf, 2026-09-24).
//
// « Toute mise à jour back et front sera effective directement après un
// rechargement ou une relance de l'app. » Un service worker cache-first
// (l'ancienne version de ce fichier) contredisait la règle : il resservait
// les assets depuis le cache même après F5, et l'app montrait l'ancienne
// version alors que le serveur portait la nouvelle.
//
// Ici : chaque requête GET va D'ABORD au réseau ; le cache n'est qu'un
// repli hors-ligne, rafraîchi en arrière-plan (put derrière une copie,
// jamais bloquant). Le nom de cache change à chaque règle : les anciens
// caches (« ulysse-v1 », cache-first) sont purgés au premier activate.

const CACHE = "ulysse-reseau-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r && r.ok && r.type === "basic") {
          const copie = r.clone();
          caches.open(CACHE)
            .then((c) => c.put(req, copie))
            .catch(() => {});
        }
        return r;
      })
      .catch(() =>
        caches.match(req).then((m) => m || Response.error())
      )
  );
});
