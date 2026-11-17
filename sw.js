"use strict";

const SHELL = {"v":"1.1","fp":"df8bf22ffd8a659393204b8e9382bd98c946389f946ea21e764bc12d08be4567","files":[["app.js","0c7ed8e50cb6b6dc41938625938e9f5fefc7ec0bf4ac4513cf64dfefff4985df"],["cells.js","e76612bffb4494f94d491c45bc4aa9b82ba5acf104447060113637e760fb01c8"],["data.html","93630231344e4207729209aa5b66c6f2513a501819f3790ad0082ce67a797bc4"],["data.js","b40e6d6709cb14ca359bbbfa7facde287e406ede131e4c73fca2684dc8ac5815"],["decide.js","c63a7d11ccce0bc1aa90168889dce867cdcd387322f1b56de2d72c9044f673c3"],["gate.js","89ccbd7e8383c405b1b6326fcb41d83abd28be0c2fd5e9d88d97b6a03ae77e37"],["icon-192.png","3c2328a4bf11a171344384667542c58d00fe604c45daa1285675280956dfddc9"],["icon-512.png","6a32d81e6ccd36592471727115c6a4b66dbeec4307693bb7e57a196ccd493fa7"],["index.html","e7e4b51399964a07e62479a9270029b4b9d799f0b7d653ce91d1639492e00a4f"],["manifest.webmanifest","72def89fe5026bc0dd873eff07dc1efcb1dbba57d84b52bc6574856e53a9c8af"],["mobile.css","fe162e16db376e429fdbc60f2348e46847070604af73741c2f6aad5c3c539088"],["model.html","5730905b1d10f6b2738f309c65e662f975608c20c42319c8d2f0bd48784a9cca"],["model.js","1beaa6feded32ed2f49c729be08be98fd6be14ebe6e868a02281b9cb46202c42"],["passphrase.js","3e8fc48b9f8e5afdb351b289648d501b6dd12696f272d31ce0668824ab48ccd7"],["physics.js","a19d1352a5fb903c0276801c0b4d12e01edda6f1f9c7aef6b45f345caca84924"],["record_format.js","b71bbe41db6eed9b525eae27f60486bc8e6eba8dad6bc2069bc1b8144bc9bfc3"],["settings.js","064c1661303150eac970c85151722ed0b0ce5c19ad93375262b1f9cdff2b9fa5"],["shots_table.js","4d07b37c1070d87d17a11fb8a765822326a34fa004fa6195f725ba20948e21e9"],["store.js","57597b87e1dd3ace16cbcfdd34bf19b622fd96d287a6be470fa5d345468f366e"],["tabs.css","5cb527b8c5bc277140d08ce65c5720db092cf6fc60c06eb86b7af297583f6754"],["tabs.js","08fa144cb3a66eeaf4cbe25e375f93f533ba054898a3c11b11bed0c65c7c08d2"]]};
const CACHE_PREFIX = "golflab-shell-";
const OLD_CACHE_SHAPES = Object.freeze([/^golflab-shell-[0-9a-f]{64}$/, /^golflab-poc-/, /^golf-v2\.4\.0$/]);
const RECOVER_HTML = [
  "<!doctype html>",
  "<meta name='viewport' content='width=device-width'>",
  "<p>新しい版に替えています</p>",
  "<script src='golflab-recover.js'></script>",
].join("\n");
const RECOVER_JS = [
  "(function () {",
  "  'use strict';",
  "  var p = document.querySelector('p');",
  "  var sw = navigator.serviceWorker;",
  "  var reloaded = false;",
  "  function reloadOnce() { if (!reloaded) { reloaded = true; location.reload(); } }",
  "  function offline() { p.textContent = '電波のある所で開いてね'; }",
  "  function ask(reg) {",
  "    if (reg && reg.waiting) { reg.waiting.postMessage({ type: 'golflab-activate' }); return true; }",
  "    return false;",
  "  }",
  "  if (!sw) { offline(); return; }",
  "  sw.addEventListener('controllerchange', reloadOnce);",
  "  document.addEventListener('visibilitychange', function () {",
  "    if (document.visibilityState === 'visible') reloadOnce();",
  "  });",
  "  sw.getRegistration().then(function (reg) {",
  "    if (!reg || ask(reg)) return;",
  "    reg.addEventListener('updatefound', function () {",
  "      var w = reg.installing;",
  "      if (w) w.addEventListener('statechange', function () { if (w.state === 'installed') ask(reg); });",
  "    });",
  "    return reg.update().then(function () { ask(reg); }, offline);",
  "  }).catch(offline);",
  "})();",
].join("\n");

function checkShell(shell) {
  const hex = /^[0-9a-f]{64}$/;
  if (!shell || typeof shell !== "object" || Array.isArray(shell)) return false;
  if (typeof shell.fp !== "string" || !hex.test(shell.fp)) return false;
  if (!Array.isArray(shell.files) || shell.files.length === 0) return false;
  return shell.files.every((f) => Array.isArray(f) && f.length === 2 && typeof f[0] === "string" && f[0] !== ""
    && typeof f[1] === "string" && hex.test(f[1]));
}

async function sha256hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function installShell(shell) {
  if (!checkShell(shell)) throw new Error("shell");
  const got = [];
  for (const [path, hex] of shell.files) {
    const res = await fetch(new Request(path, { cache: "reload" }));
    if (!res.ok) throw new Error("fetch");
    const body = await res.arrayBuffer();
    if ((await sha256hex(body)) !== hex) throw new Error("digest");
    got.push([path, body, res.headers.get("Content-Type")]);
  }
  const name = CACHE_PREFIX + shell.fp;
  try {
    const cache = await caches.open(name);
    for (const [path, body, type] of got) {
      await cache.put(new Request(path), new Response(body, type ? { headers: { "Content-Type": type } } : {}));
    }
  } catch (e) {
    await caches.delete(name);
    throw e;
  }
}

async function cleanOld(current) {
  for (const name of await caches.keys()) {
    if (name !== current && OLD_CACHE_SHAPES.some((re) => re.test(name))) await caches.delete(name);
  }
}

function keyOf(url) {
  const u = new URL(url);
  const scope = new URL(self.registration.scope);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return null;
  const rest = u.pathname.slice(scope.pathname.length);
  return rest === "" || rest.endsWith("/") ? rest + "index.html" : rest;
}

async function fromNetwork(shell, cache, key, mustKeep) {
  const item = shell.files.find((f) => f[0] === key);
  if (!item) return Response.error();
  let body = null;
  let type = null;
  try {
    const res = await fetch(new Request(key, { cache: "reload" }));
    if (!res.ok) return Response.error();
    body = await res.arrayBuffer();
    type = res.headers.get("Content-Type");
  } catch (e) {
    return Response.error();
  }
  if ((await sha256hex(body)) !== item[1]) return Response.error();
  const init = type ? { headers: { "Content-Type": type } } : {};
  try {
    await cache.put(new Request(key), new Response(body, init));
  } catch (e) {
    if (mustKeep) return Response.error();
  }
  return new Response(body, init);
}

async function serveNav(shell, key) {
  const moving = shell.files.map((f) => f[0]).filter((p) => p !== key && (p.endsWith(".js") || p === "mobile.css"));
  let page = null;
  try {
    const cache = await caches.open(CACHE_PREFIX + shell.fp);
    for (const path of [key].concat(moving)) {
      let res = await cache.match(new Request(path), { ignoreSearch: true });
      if (!res) {
        res = await fromNetwork(shell, cache, path, true);
        if (!res.ok) return recoverPage(false);
      }
      if (path === key) page = res;
    }
  } catch (e) {
    return recoverPage(false);
  }
  return page;
}

function recoverPage(script) {
  if (script) return new Response(RECOVER_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
  return new Response(RECOVER_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; object-src 'none'; base-uri 'none'; "
        + "form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'",
      "Cache-Control": "no-store",
    },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell(SHELL));
});

self.addEventListener("activate", (event) => {
  if (checkShell(SHELL)) event.waitUntil(cleanOld(CACHE_PREFIX + SHELL.fp));
});

self.addEventListener("message", (event) => {
  const d = event.data;
  if (d && typeof d === "object" && Object.keys(d).length === 1 && d.type === "golflab-activate") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const key = keyOf(req.url);
  if (key === null || key === "data.json.enc" || key === "sw.js") return;
  if (key === "golflab-recover.js") {
    event.respondWith(recoverPage(true));
    return;
  }
  if (!checkShell(SHELL) || !SHELL.files.some((f) => f[0] === key)) {
    event.respondWith(fetch(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(serveNav(SHELL, key));
    return;
  }
  event.respondWith(caches.open(CACHE_PREFIX + SHELL.fp).then((cache) =>
    cache.match(new Request(key), { ignoreSearch: true }).then((hit) => hit || fromNetwork(SHELL, cache, key))));
});
