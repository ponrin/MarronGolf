const CACHE = "golflab-poc-1-lkcopackogki";
const PRECACHE = ["./", "index.html", "data.html", "model.html", "physics.js", "cells.js", "app.js", "data.js", "model.js", "gate.js", "mobile.css", "manifest.json", "icon-gl-192.png", "icon-gl-512.png", "apple-touch-icon.png", "data.json.enc"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

const OURS = (k) => k !== CACHE && (k.startsWith("golf-v") || k.startsWith("golflab-"));

self.addEventListener("activate", (e) => {
  const done = caches.keys()
    .then((keys) => Promise.all(keys.filter(OURS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim());
  e.waitUntil(done);
  done.then(() => setTimeout(reloadForeignPages, 0));
});

function reloadForeignPages() {
  const scope = self.registration.scope;
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const pages = list.filter((c) => c.url.startsWith(scope));
    if (!pages.length) return;
    const id = Math.random().toString(36).slice(2);
    const answered = new Set();
    ping = { id, answered };
    pages.forEach((c) => c.postMessage({ type: "golflab-ping", id }));
    return new Promise((r) => setTimeout(r, 1500)).then(() => {
      ping = null;
      pages.filter((c) => !answered.has(c.id)).forEach((c) => { if (c.navigate) c.navigate(c.url).catch(() => {}); });
    });
  });
}

let ping = null;
self.addEventListener("message", (ev) => {
  if (ping && ev.data && ev.data.type === "golflab-pong" && ev.data.id === ping.id && ev.source) ping.answered.add(ev.source.id);
});

function networkFirst(req, fallbackUrl) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.open(CACHE).then((c) =>
    c.match(req, { ignoreSearch: true }).then((hit) => hit || (fallbackUrl ? c.match(fallbackUrl) : undefined))
  ).then((hit) => hit || Response.error()));
}

function cacheFirst(req) {
  return caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok) c.put(req, res.clone());
    return res;
  })));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (req.mode === "navigate" || req.destination === "document" || path.endsWith(".html") || path.endsWith("/")) {
    e.respondWith(networkFirst(req, "index.html"));
  } else if (path.endsWith("data.json.enc")) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});
