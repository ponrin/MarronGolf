(function () {
  "use strict";
  var DB = "golflab-poc", STORE = "keys", KEY_ID = "data-key";
  var pending = null;

  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), req = fn(st);
        tx.oncomplete = function () { db.close(); res(req && req.result); };
        tx.onerror = tx.onabort = function () { db.close(); rej(tx.error); };
      });
    });
  }
  var keyGet = function () { return idbDo("readonly", function (s) { return s.get(KEY_ID); }); };
  var keyPut = function (k) { return idbDo("readwrite", function (s) { return s.put(k, KEY_ID); }); };
  var keyDel = function () { return idbDo("readwrite", function (s) { return s.delete(KEY_ID); }); };

  function b64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function fetchEnc() {
    return fetch("data.json.enc", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (env) {
      if (!env || env.v !== 1 || env.kdf !== "PBKDF2-SHA256" || env.alg !== "AES-256-GCM") throw new Error("形式が違う");
      return { iter: env.iter, salt: b64(env.salt), iv: b64(env.iv), ct: b64(env.ct) };
    });
  }

  function derive(pass, env) {
    var raw = new TextEncoder().encode(pass.normalize("NFC"));
    return crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: env.salt, iterations: env.iter },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    });
  }

  function decrypt(key, env) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: env.iv }, key, env.ct).then(function (pt) {
      return JSON.parse(new TextDecoder().decode(pt));
    });
  }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  function askPass(env) {
    return new Promise(function (resolve) {
      var wrap = el("div", { id: "gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "gate-title" });
      var form = el("form", { class: "gate-card", autocomplete: "on" });
      form.appendChild(el("h1", { id: "gate-title" }, "GolfLab"));
      form.appendChild(el("p", { class: "gate-lead" }, "合言葉を入れてね。この端末では最初の 1 回だけ聞くよ。"));
      var label = el("label", { for: "gate-pass" }, "合言葉");
      var input = el("input", { id: "gate-pass", type: "password", autocomplete: "current-password",
        autocapitalize: "none", autocorrect: "off", spellcheck: "false", enterkeyhint: "go", required: "" });
      var btn = el("button", { type: "submit", class: "gate-btn" }, "開く");
      var msg = el("p", { class: "gate-msg", role: "status", "aria-live": "polite" });
      form.appendChild(label); form.appendChild(input); form.appendChild(btn); form.appendChild(msg);
      wrap.appendChild(form);
      document.body.appendChild(wrap);
      document.documentElement.classList.add("gate-open");
      setTimeout(function () { input.focus(); }, 50);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var pass = input.value.trim();
        if (!pass) { msg.textContent = "合言葉が空だよ。"; return; }
        btn.disabled = true; input.disabled = true;
        msg.className = "gate-msg"; msg.textContent = "確かめています…";
        derive(pass, env).then(function (key) {
          return decrypt(key, env).then(function (data) {
            return keyPut(key).catch(function () {  })
              .then(function () { wrap.remove(); document.documentElement.classList.remove("gate-open"); resolve(data); });
          });
        }).catch(function () {
          btn.disabled = false; input.disabled = false;
          msg.className = "gate-msg err"; msg.textContent = "合言葉が違うみたい。もう一度入れてね。";
          input.select();
        });
      });
    });
  }

  window.loadData = function () {
    if (pending) return pending;
    if (!(window.crypto && crypto.subtle && window.indexedDB)) {
      return (pending = Promise.reject(new Error("このブラウザでは暗号の機能が使えない (https で開いてね)")));
    }
    pending = fetchEnc().then(function (env) {
      return keyGet().catch(function () { return null; }).then(function (key) {
        if (!key) return askPass(env);
        return decrypt(key, env).catch(function () {
          return keyDel().catch(function () {}).then(function () { return askPass(env); });
        });
      });
    });
    return pending;
  };

  function addForgetButton() {
    var top = document.querySelector("header.top");
    if (!top || document.getElementById("gate-forget")) return;
    var b = el("button", { type: "button", id: "gate-forget", class: "gate-forget" }, "鍵を消す");
    b.addEventListener("click", function () {
      if (!confirm("この端末に覚えた鍵を消す？ 次に開く時にまた合言葉を聞くよ。")) return;
      keyDel().catch(function () {}).then(function () { location.reload(); });
    });
    top.appendChild(b);
  }

  function tapTips() {
    var bar = el("div", { id: "tap-tip", role: "status", "aria-live": "polite", hidden: "" });
    document.body.appendChild(bar);
    var timer = null;
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!(t instanceof Element) || t.closest("#gate")) return;
      if (t.closest("button, a, input, select, textarea, summary, label")) return;
      var text = "";
      for (var n = t; n && n !== document.body; n = n.parentElement) {
        if (n.namespaceURI === "http://www.w3.org/2000/svg") {
          var tt = n.querySelector(":scope > title");
          if (tt && tt.textContent) { text = tt.textContent; break; }
          if (n.tagName.toLowerCase() === "svg") break;
        } else if (n.getAttribute && n.getAttribute("title")) { text = n.getAttribute("title"); break; }
      }
      if (!text) return;
      bar.textContent = text; bar.hidden = false;
      clearTimeout(timer); timer = setTimeout(function () { bar.hidden = true; }, 6000);
    });
    bar.addEventListener("click", function () { bar.hidden = true; });
  }

  addForgetButton();
  tapTips();
  if ("serviceWorker" in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }
      if (reloading) return;
      reloading = true;
      var KEY = "golflab-sw-reload", now = Date.now(), last = 0;
      try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch (e) {  }
      if (now - last < 30000) return;
      try { sessionStorage.setItem(KEY, String(now)); } catch (e) {  }
      location.reload();
    });
    navigator.serviceWorker.addEventListener("message", function (ev) {
      if (ev.data && ev.data.type === "golflab-ping" && ev.source && ev.source.postMessage) {
        ev.source.postMessage({ type: "golflab-pong", id: ev.data.id });
      }
    });
    if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
