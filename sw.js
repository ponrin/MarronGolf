"use strict";

const SHELL = {"v":"1.1","fp":"64e500c5c0a35130affe8a6e9fdf5b2f9232061283d284819f91b4437191e1e0","files":[["app.js","70e397f98c1e7d792fed4e9332771bb7ef6690d7b78234588ff4798deefe52a0"],["cells.js","e76612bffb4494f94d491c45bc4aa9b82ba5acf104447060113637e760fb01c8"],["data.js","7f2686bcaa092f13683d6871d2a6507541d361d66ba0a926152da7b12617e22c"],["decide.js","c63a7d11ccce0bc1aa90168889dce867cdcd387322f1b56de2d72c9044f673c3"],["gate.js","89ccbd7e8383c405b1b6326fcb41d83abd28be0c2fd5e9d88d97b6a03ae77e37"],["icon-192.png","3c2328a4bf11a171344384667542c58d00fe604c45daa1285675280956dfddc9"],["icon-512.png","6a32d81e6ccd36592471727115c6a4b66dbeec4307693bb7e57a196ccd493fa7"],["index.html","5370c47aefa34d832c1fe507d0048edd195baf055bede6cf70e661903954a617"],["manifest.webmanifest","6a3a41ae70e4151adf5e757223130d6bff8a37f27617bace423f6439b118e074"],["mobile.css","74cbe950c8a05556b7487e1e2c42ba76ec3e165be24bbf55855c964caf202db0"],["model.html","da4259fe8a7ba623be02778de6b05694b21ec031c4778b74b60d72fc64358685"],["model.js","ff284bbb606bf9a19ae18cf252392d3ace09a803f91c28526664afad59e797cd"],["passphrase.js","ee97be47f0fa9a37f418183e59f172b6198c4552281873fc8e2db094997af646"],["physics.js","89304e78f1cac1d2da963c1718b0bd4283c2749e04ec6f851a3ac55f2dc8032f"],["record_format.js","b71bbe41db6eed9b525eae27f60486bc8e6eba8dad6bc2069bc1b8144bc9bfc3"],["screen.css","eba6f54a42820dd689ebd5b8717293c308c5f735ffef146c2bc324f744421c64"],["settings.js","f6e3a3df9471ad53b0c4cff88504562b3f8ec76fd4dedc52f48cf874686d69dc"],["store.js","57597b87e1dd3ace16cbcfdd34bf19b622fd96d287a6be470fa5d345468f366e"],["tabs.js","1d57c3586ef7fc4d92b942601d923869791d6570c1d07c353eddb19bad009b69"]]};
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
  const moving = shell.files.map((f) => f[0]).filter((p) => p !== key && (p.endsWith(".js") || p.endsWith(".css")));
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
