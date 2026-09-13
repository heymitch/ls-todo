/* sw.js — network first, cache as the offline fallback. Every open gets the current build. */
const VERSION = "todo-v4";
const SHELL = ["./", "./index.html", "./app.js", "./format.js", "./scribe.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== "GET") return;
  if (url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match("./index.html")))
  );
});
