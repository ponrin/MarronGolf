var GolfLabStore = (function () {
  "use strict";

  var DB_NAME = "golflab-pwa";
  var DB_VERSION = 1;
  var STORE = "pair";
  var KEY_ID = "current";
  var OLD_DBS = Object.freeze(["golflab-poc"]);
  var MAX_G = 9007199254740991;
  var MAX_N = 4294967295;

  var db = null;
  var opening = null;

  function copyBytes(b) {
    if (b instanceof ArrayBuffer) return b.slice(0);
    if (ArrayBuffer.isView(b)) return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return null;
  }

  function checkPair(v) {
    var none = { ok: true, g: 0, key: null, bytes: null, ver: null, n: null, broken: false };
    if (v === undefined || v === null) return none;
    if (typeof v !== "object" || !Number.isInteger(v.g) || v.g < 0 || v.g > MAX_G) {
      return { ok: false, reason: "保存の世代が読めない" };
    }
    var out = { ok: true, g: v.g, key: null, bytes: null, ver: null, n: null, broken: false };
    var isKey = typeof CryptoKey !== "undefined" && v.key instanceof CryptoKey;
    if (v.key !== null && v.key !== undefined && !isKey) {
      out.broken = true;
      return out;
    }
    var hasBytes = v.bytes !== null && v.bytes !== undefined;
    var hasVer = v.ver !== null && v.ver !== undefined;
    var hasN = v.n !== null && v.n !== undefined;
    if (!hasBytes && !hasVer && !hasN) {
      out.key = isKey ? v.key : null;
      return out;
    }
    var okBytes = v.bytes instanceof ArrayBuffer && v.bytes.byteLength >= 1;
    var okVer = typeof v.ver === "string" && v.ver !== "";
    var okN = Number.isInteger(v.n) && v.n >= 1 && v.n <= MAX_N;
    if (!(okBytes && okVer && okN)) {
      out.broken = true;
      return out;
    }
    out.key = isKey ? v.key : null;
    out.bytes = v.bytes;
    out.ver = v.ver;
    out.n = v.n;
    return out;
  }

  function checkArgs(g0, key, bytes, ver, n, withRecord) {
    if (!Number.isInteger(g0) || g0 < 0 || g0 >= MAX_G) return false;
    if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return false;
    if (!key.algorithm || key.algorithm.name !== "AES-GCM" || key.extractable !== false) return false;
    if (!Array.isArray(key.usages) || key.usages.length !== 1 || key.usages[0] !== "decrypt") return false;
    if (!withRecord) return true;
    var okBytes = (bytes instanceof ArrayBuffer || bytes instanceof Uint8Array) && bytes.byteLength >= 1;
    if (!okBytes) return false;
    if (typeof ver !== "string" || ver === "") return false;
    return Number.isInteger(n) && n >= 1 && n <= MAX_N;
  }

  function withTx(mode, work) {
    return new Promise(function (resolve) {
      var ctx = { stale: false, value: undefined };
      var tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch (e) {
        resolve({ done: "failed", ctx: ctx });
        return;
      }
      tx.oncomplete = function () { resolve({ done: "complete", ctx: ctx }); };
      tx.onabort = function () { resolve({ done: ctx.stale ? "stale" : "failed", ctx: ctx }); };
      tx.onerror = function () {   };
      try {
        work(tx.objectStore(STORE), tx, ctx);
      } catch (e) {
        try { tx.abort(); } catch (e2) { resolve({ done: "failed", ctx: ctx }); }
      }
    });
  }

  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise(function (resolve) {
      var req;
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) {
          resolve({ ok: false, reason: "保存の場所が使えない" });
          return;
        }
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        resolve({ ok: false, reason: "保存の場所を開けない" });
        return;
      }
      req.onupgradeneeded = function () {
        try {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        } catch (e) {   }
      };
      req.onsuccess = function () {
        var d = req.result;
        d.onversionchange = function () {
          try { d.close(); } catch (e) {   }
          if (db === d) db = null;
        };
        d.onclose = function () { if (db === d) db = null; };
        db = d;
        resolve(d);
      };
      req.onerror = function () { resolve({ ok: false, reason: "保存の場所を開けない" }); };
      req.onblocked = function () { resolve({ ok: false, reason: "保存の場所がほかで使われている" }); };
    }).then(function (v) {
      opening = null;
      return v;
    });
    return opening;
  }

  function isOpen() {
    return db !== null;
  }

  function read() {
    return open().then(function (d) {
      if (!d || d.ok === false) return { ok: false, reason: "保存の場所を開けない" };
      return withTx("readonly", function (store, tx, ctx) {
        var req = store.get(KEY_ID);
        req.onsuccess = function () { ctx.value = req.result; };
      }).then(function (r) {
        if (r.done !== "complete") return { ok: false, reason: "保存を読めない" };
        return checkPair(r.ctx.value);
      });
    }).catch(function () {
      return { ok: false, reason: "保存を読めない" };
    });
  }

  function savePair(g0, key, bytes, ver, n) {
    if (!checkArgs(g0, key, bytes, ver, n, true)) return Promise.resolve("failed");
    var copy = copyBytes(bytes);
    return open().then(function (d) {
      if (!d || d.ok === false) return "failed";
      return withTx("readwrite", function (store, tx, ctx) {
        var req = store.get(KEY_ID);
        req.onsuccess = function () {
          var cur = req.result;
          var g = cur === undefined || cur === null ? 0 : (cur && Number.isInteger(cur.g) ? cur.g : -1);
          if (g !== g0) {
            ctx.stale = true;
            tx.abort();
            return;
          }
          store.put({ g: g0 + 1, key: key, bytes: copy, ver: ver, n: n }, KEY_ID);
        };
      }).then(function (r) {
        return r.done === "complete" ? "ok" : r.done;
      });
    }).catch(function () {
      return "failed";
    });
  }

  function saveKey(g0, key) {
    if (!checkArgs(g0, key, null, null, null, false)) return Promise.resolve("failed");
    return open().then(function (d) {
      if (!d || d.ok === false) return "failed";
      return withTx("readwrite", function (store, tx, ctx) {
        var req = store.get(KEY_ID);
        req.onsuccess = function () {
          var p = checkPair(req.result);
          if (!p.ok || p.broken || p.g !== g0 || p.bytes === null || p.key !== null) {
            ctx.stale = true;
            tx.abort();
            return;
          }
          store.put({ g: g0 + 1, key: key, bytes: p.bytes, ver: p.ver, n: p.n }, KEY_ID);
        };
      }).then(function (r) {
        return r.done === "complete" ? "ok" : r.done;
      });
    }).catch(function () {
      return "failed";
    });
  }

  function eraseKey() {
    if (!db) return Promise.resolve("failed");
    return withTx("readwrite", function (store, tx, ctx) {
      var req = store.get(KEY_ID);
      req.onsuccess = function () {
        var cur = req.result;
        var p = checkPair(cur);
        var next = p.ok ? Math.min(p.g + 1, MAX_G) : 1;
        if (p.ok && !p.broken && cur !== undefined && cur !== null) {
          store.put({ g: next, key: null, bytes: p.bytes, ver: p.ver, n: p.n }, KEY_ID);
          return;
        }
        var g = next;
        store.put({ g: g, key: null, bytes: null, ver: null, n: null }, KEY_ID);
      };
    }).then(function (r) {
      return r.done === "complete" ? "ok" : "failed";
    }).catch(function () {
      return "failed";
    });
  }

  function purgeOld() {
    return new Promise(function (resolve) {
      var left = OLD_DBS.length;
      function one() {
        left -= 1;
        if (left === 0) resolve();
      }
      if (typeof indexedDB === "undefined" || !indexedDB) {
        resolve();
        return;
      }
      OLD_DBS.forEach(function (name) {
        if (name === DB_NAME) {
          one();
          return;
        }
        try {
          var req = indexedDB.deleteDatabase(name);
          req.onsuccess = one;
          req.onerror = one;
          req.onblocked = one;
        } catch (e) {
          one();
        }
      });
    }).then(function () { return undefined; });
  }

  return Object.freeze({
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE: STORE,
    KEY_ID: KEY_ID,
    OLD_DBS: OLD_DBS,
    open: open,
    isOpen: isOpen,
    read: read,
    savePair: savePair,
    saveKey: saveKey,
    eraseKey: eraseKey,
    purgeOld: purgeOld,
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = GolfLabStore;
