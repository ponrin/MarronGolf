var GolfLabGate = (function () {
  "use strict";

  var COVER = "golflab-cover";
  var RECORD_URL = "data.json.enc";
  var SW_URL = "sw.js";
  var CHANNEL = "golflab-gate";
  var POLICY = "golflab-sw";
  var REDECIDE_MAX = 3;
  var PATHS_KEPT = 8;

  var epoch = 0;
  var eraseFailed = false;
  var erasing = 0;
  var covers = 0;
  var away = false;
  var handlers = { draw: null, discard: null };
  var pending = null;
  var drawn = false;
  var drawnBytes = null;
  var handText = null;
  var got = null;
  var paths = [];
  var busy = 0;
  var saving = Promise.resolve();
  var redecides = 0;
  var reloading = false;
  var requested = false;
  var hadController = false;
  var reg = null;
  var policy = null;
  var channel = null;
  var watched = false;

  function sameBytes(a, b) {
    if (!a || !b) return false;
    var x = a instanceof Uint8Array ? a : new Uint8Array(a);
    var y = b instanceof Uint8Array ? b : new Uint8Array(b);
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) {
      if (x[i] !== y[i]) return false;
    }
    return true;
  }

  function onHide() {
    covers += 1;
    document.documentElement.classList.add(COVER);
  }

  function readState(path, expectG) {
    var sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
    var regLookup = sw && typeof sw.getRegistration === "function"
      ? Promise.resolve().then(function () { return sw.getRegistration(); }).catch(function () { return reg; })
      : Promise.resolve(reg);
    return regLookup.then(function (found) {
      return GolfLabStore.read().then(function (r) { return { r: r, w: found }; });
    }).then(function (both) {
      var r = both.r;
      var w = both.w || reg;
      GolfLabPassphrase.eraseReady(GolfLabStore.isOpen());
      if (!r || r.ok !== true) {
        GolfLabPassphrase.say("saveFailed");
        return { ok: false };
      }
      if (eraseFailed && !r.key) eraseFailed = false;
      var meta = document.querySelector('meta[name="golflab-v"]');
      var v = meta ? meta.getAttribute("content") : null;
      var mm = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
      var gMoved = !!path && expectG !== undefined && r.g !== expectG;
      var s = {
        shellV: v === null ? undefined : v,
        stored: r.bytes ? { ver: r.ver, n: r.n } : null,
        hasKey: !!(r.key && r.bytes),
        standalone: !!(mm && mm.matches) || (typeof navigator !== "undefined" && navigator.standalone === true),
        workerWaiting: !!(w && w.waiting),
        cancelled: !!path && path.epoch !== epoch,
        eraseFailed: eraseFailed,
        gMoved: !!path && path.epoch === epoch && gMoved,
      };
      return { ok: true, s: s, g: r.g, rec: r };
    });
  }

  function onOpenPath(force) {
    onHide();
    var ep = epoch;
    var cv = covers;
    function uncover() {
      if (covers !== cv || erasing > 0 || eraseFailed || epoch !== ep) return;
      if (away || document.visibilityState === "hidden") return;
      document.documentElement.classList.remove(COVER);
    }
    if (!force && busy > 0) {
      return readState().then(function (st) {
        if (!st.ok || epoch !== ep) return;
        if (drawn && !st.rec.key) {
          onNotice({ type: "erase" });
          return;
        }
        uncover();
      });
    }
    return readState().then(function (st) {
      if (!st.ok || epoch !== ep) return;
      if (!eraseFailed) GolfLabPassphrase.close(false);
      var path = { epoch: ep, g0: st.g, rec: st.rec, s: st.s, cands: {}, saved: null, pick: null };
      paths.push(path);
      if (paths.length > PATHS_KEPT) {
        var old = paths.shift();
        old.cands = {};
        old.saved = null;
        if (old.rec) old.rec.key = null;
      }
      var dec = GolfLabDecide.onOpen(st.s);
      runSteps(dec, path);
      if (dec && dec.ok === true) uncover();
    });
  }

  function runSteps(dec, path) {
    if (!dec || dec.ok !== true || !Array.isArray(dec.steps)) return;
    for (var k = 0; k < dec.steps.length; k++) {
      if (GolfLabDecide.STEPS.indexOf(dec.steps[k]) < 0) return;
    }
    var steps = dec.steps.slice();
    var P = GolfLabPassphrase;
    function after(d) {
      runSteps(d, path);
      path.cands = {};
    }
    function save(word) {
      var c = path.cands[dec.pick];
      if (!c) return Promise.resolve();
      busy += 1;
      var p = word === "savePair"
        ? GolfLabStore.savePair(path.g0, c.key, c.bytes, c.ver, c.n)
        : GolfLabStore.saveKey(path.g0, c.key);
      saving = p.then(function () {}, function () {});
      return p.then(function (r) {
        return readState(path, r === "ok" ? path.g0 + 1 : undefined).then(function (st) {
          busy -= 1;
          if (!st.ok) return;
          path.saved = c;
          path.pick = dec.pick;
          after(GolfLabDecide.onSaved(st.s, r));
          path.saved = null;
          path.pick = null;
        });
      }, function () { busy -= 1; });
    }
    function one(i) {
      if (i >= steps.length) return Promise.resolve();
      var word = steps[i];
      var wait = null;
      if (word === "homeHint") P.hint();
      else if (word === "drawStored") {
        var rec = path.rec;
        busy += 1;
        var drawing = openRecord(rec.bytes, rec.key).then(function (o) {
          busy -= 1;
          if (o.status !== "opened" || o.ver !== path.s.shellV) return;
          return guardDraw(path, path.g0, function () {
            deliver(o.text, "stored", rec.bytes, path, path.g0);
          });
        }, function () { busy -= 1; });
        if (steps[i + 1] !== "fetch") wait = drawing;
      } else if (word === "fetch") {
        busy += 1;
        wait = fetchRecord(path).then(function (f) {
          return readState(path, path.g0).then(function (st) {
            busy -= 1;
            if (!st.ok) {
              path.cands = {};
              return;
            }
            path.s = st.s;
            after(GolfLabDecide.onFetched(st.s, f));
          });
        }, function () { busy -= 1; });
      } else if (word === "showSwitching") P.say("switching");
      else if (word === "showOfflineFirst") P.say("offlineFirst");
      else if (word === "showOfflineNewVersion") P.say("offlineNewVersion");
      else if (word === "noteFetchFailed") P.say("fetchFailed");
      else if (word === "hide") deliver(null);
      else if (word === "ask") P.ask(false);
      else if (word === "askAgain") P.ask(true);
      else if (word === "savePair" || word === "saveKey") wait = save(word);
      else if (word === "drawSaved") {
        var c = path.saved;
        if (c) {
          var from = path.pick;
          wait = guardDraw(path, path.g0 + 1, function () {
            deliver(c.text, from, c.bytes, path, path.g0 + 1);
            P.close(false);
            redecides = 0;
          });
        }
      } else if (word === "keep") {
      } else if (word === "wait") P.close(true);
      else if (word === "checkUpdate") {
        Promise.resolve().then(function () {
          var sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
          return reg || (sw && typeof sw.getRegistration === "function" ? sw.getRegistration() : null);
        }).then(function (r) {
          return r && typeof r.update === "function" ? r.update() : null;
        }).catch(function () {});
      } else if (word === "swapShell") wait = swap("swap");
      else if (word === "reloadOnce") wait = swap("reload");
      else if (word === "redecide") {
        redecides += 1;
        if (redecides >= REDECIDE_MAX) {
          P.say("saveFailed");
          return Promise.resolve();
        }
        wait = onOpenPath(true);
      }
      if (wait) return wait.then(function () { return one(i + 1); }, function () { return one(i + 1); });
      return one(i + 1);
    }
    return one(0);
  }

  function guardDraw(path, baseG, draw) {
    if (epoch !== path.epoch || eraseFailed) return Promise.resolve(false);
    return readState().then(function (st) {
      if (!st.ok || epoch !== path.epoch || eraseFailed) return false;
      if (st.g !== baseG || !st.rec.key) {
        onOpenPath(true);
        return false;
      }
      draw();
      return true;
    });
  }

  function deliver(text, from, bytes, path, baseG) {
    if (text === null) {
      var was = drawn;
      pending = null;
      handText = null;
      drawnBytes = null;
      drawn = false;
      paths.forEach(function (p) {
        p.cands = {};
        p.saved = null;
        p.pick = null;
        if (p.rec) p.rec.key = null;
      });
      if (handlers.discard) {
        try { handlers.discard(); } catch (e) {   }
      }
      return was;
    }
    if (drawn && sameBytes(drawnBytes, bytes)) return false;
    if (!handlers.draw) {
      pending = { text: text, from: from, bytes: bytes, path: path, baseG: baseG };
      return false;
    }
    var info = { redraw: drawn, from: from };
    handText = text;
    drawnBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    drawn = true;
    try {
      handlers.draw(JSON.parse(handText), info);
    } catch (e) {   }
    return true;
  }

  function listen(h) {
    var o = h && typeof h === "object" ? h : {};
    handlers = {
      draw: typeof o.draw === "function" ? o.draw : null,
      discard: typeof o.discard === "function" ? o.discard : null,
    };
    if (pending) {
      var p = pending;
      Promise.resolve().then(function () {
        if (pending !== p) return null;
        return guardDraw(p.path, p.baseG, function () {
          if (pending !== p) return;
          pending = null;
          deliver(p.text, p.from, p.bytes, p.path, p.baseG);
        });
      }).then(function () {
        if (pending === p) pending = null;
      }, function () {
        if (pending === p) pending = null;
      });
    }
  }

  function openRecord(bytes, key) {
    var F = GolfLabRecordFormat;
    var h = F.parseHeader(bytes);
    if (!h.ok) return Promise.resolve({ status: "unreadable" });
    var n = h.header.n;
    if (!key) return Promise.resolve({ status: "locked", n: n });
    return Promise.resolve().then(function () {
      return crypto.subtle.decrypt(F.gcmParams(h.header, h.aad), key, h.body);
    }).then(function (plain) {
      var text = null;
      var ver = null;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
        var data = JSON.parse(text);
        if (data && typeof data === "object" && !Array.isArray(data) && Number.isInteger(data.v) && data.v >= 1) {
          ver = F.versionOf(h.header.form, data.v);
        }
      } catch (e) {
        ver = null;
      }
      return { status: "opened", n: n, ver: ver, text: ver === null ? null : text };
    }, function () {
      return { status: "noOpen", n: n };
    });
  }

  function fetchRecord(path) {
    got = null;
    return Promise.resolve().then(function () {
      return fetch(RECORD_URL, { cache: "no-store" });
    }).then(function (res) {
      if (!res || !res.ok) return null;
      return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }).catch(function () {
      return null;
    }).then(function (bytes) {
      if (!bytes) return { status: "failed" };
      if (path.epoch === epoch) got = { bytes: bytes };
      var key = path.rec ? path.rec.key : null;
      return openRecord(bytes, key).then(function (o) {
        var f = { status: o.status, sameBytes: sameBytes(bytes, path.rec ? path.rec.bytes : null) };
        if (o.status !== "unreadable") f.n = o.n;
        if (o.status === "opened") {
          f.ver = o.ver;
          if (o.ver !== null) path.cands.fetched = { key: key, bytes: bytes, ver: o.ver, n: o.n, text: o.text };
        }
        return f;
      });
    });
  }

  function derive(pass, header) {
    var F = GolfLabRecordFormat;
    var raw = new TextEncoder().encode(pass);
    return Promise.resolve().then(function () {
      return crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]);
    }).then(function (base) {
      raw.fill(0);
      return crypto.subtle.deriveKey(F.kdfParams(header), base, F.AES_KEY, false, ["decrypt"]);
    }, function (e) {
      raw.fill(0);
      throw e;
    });
  }

  function makeTries(pass, path, st) {
    var F = GolfLabRecordFormat;
    var keys = {};
    var tries = [];
    function tryOne(from, bytes, same) {
      var h = F.parseHeader(bytes);
      if (!h.ok) {
        tries.push({ from: from, status: "unreadable", sameBytes: same });
        return Promise.resolve();
      }
      var id = h.header.iterations + ":" + Array.prototype.join.call(h.header.salt, ",");
      if (!keys[id]) keys[id] = derive(pass, h.header);
      return keys[id].then(function (key) {
        return openRecord(bytes, key).then(function (o) {
          var item = { from: from, status: o.status === "locked" ? "noOpen" : o.status, n: o.n, sameBytes: same };
          if (o.status === "opened") {
            item.ver = o.ver;
            if (o.ver !== null) path.cands[from] = { key: key, bytes: bytes, ver: o.ver, n: o.n, text: o.text };
          }
          tries.push(item);
        });
      }, function () {
        tries.push({ from: from, status: "noOpen", n: h.header.n, sameBytes: same });
      });
    }
    var rec = st.rec;
    var first = Promise.resolve();
    if (!rec.key && rec.bytes) {
      if (rec.ver !== st.s.shellV) tries.push({ from: "stored", status: "skipped", n: rec.n, sameBytes: true });
      else first = tryOne("stored", rec.bytes, true);
    }
    var fetchedBytes = got ? got.bytes : null;
    return first.then(function () {
      if (fetchedBytes) return tryOne("fetched", fetchedBytes, sameBytes(fetchedBytes, rec.bytes));
    }).then(function () {
      keys = null;
      return tries;
    });
  }

  function onPass(pass) {
    if (typeof pass !== "string" || pass === "") return;
    var ep = epoch;
    var path = null;
    busy += 1;
    readState().then(function (st) {
      if (!st.ok) return null;
      path = { epoch: ep, g0: st.g, rec: st.rec, s: st.s, cands: {}, saved: null, pick: null };
      paths.push(path);
      if (paths.length > PATHS_KEPT) {
        var old = paths.shift();
        old.cands = {};
        old.saved = null;
        if (old.rec) old.rec.key = null;
      }
      return makeTries(pass, path, st).then(function (tries) {
        pass = null;
        return readState(path, path.g0).then(function (st2) {
          if (!st2.ok) return;
          path.s = st2.s;
          var d = GolfLabDecide.onPassphrase(st2.s, tries);
          busy -= 1;
          busy = Math.max(busy, 0);
          runSteps(d, path);
          path.cands = {};
          return true;
        });
      });
    }).then(function (done) {
      if (done !== true) busy = Math.max(busy - 1, 0);
      if (path) path.cands = {};
    }, function () {
      pass = null;
      busy = Math.max(busy - 1, 0);
      if (path) path.cands = {};
    });
  }

  function erase() {
    var P = GolfLabPassphrase;
    if (!GolfLabStore.isOpen()) {
      P.eraseReady(false);
      P.say("eraseFailed");
      GolfLabStore.open().then(function () { P.eraseReady(GolfLabStore.isOpen()); }, function () {});
      return;
    }
    epoch += 1;
    erasing += 1;
    onHide();
    handText = null;
    drawnBytes = null;
    pending = null;
    got = null;
    paths.forEach(function (p) {
      p.cands = {};
      p.saved = null;
      p.pick = null;
      p.rec = { ok: true, g: p.rec ? p.rec.g : 0, key: null, bytes: null, ver: null, n: null, broken: false };
    });
    paths = [];
    var p = GolfLabStore.eraseKey();
    saving = p.then(function () {}, function () {});
    p.then(function (r) {
      erasing = Math.max(erasing - 1, 0);
      if (r === "ok") {
        eraseFailed = false;
        P.close(false);
        if (channel) {
          try { channel.postMessage({ type: "erase" }); } catch (e) {   }
        }
        var reloads = drawn && !!handlers.discard;
        deliver(null);
        if (!reloads) onOpenPath(true);
        return;
      }
      eraseFailed = true;
      P.dropInput();
      P.say("eraseFailed");
    });
  }

  function onNotice(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "erase") {
      eraseFailed = false;
      epoch += 1;
      onHide();
      handText = null;
      drawnBytes = null;
      pending = null;
      got = null;
      paths.forEach(function (p) {
        p.cands = {};
        p.saved = null;
        p.pick = null;
        p.rec = { ok: true, g: p.rec ? p.rec.g : 0, key: null, bytes: null, ver: null, n: null, broken: false };
      });
      paths = [];
      onOpenPath(true);
      return;
    }
    if (msg.type === "reload") {
      var ep = epoch;
      readState().then(function (st) {
        if (!st.ok) return;
        runSteps(GolfLabDecide.onSwap(st.s, "notice"), { epoch: ep, g0: st.g, rec: st.rec, s: st.s, cands: {} });
      });
    }
  }

  function swap(kind) {
    epoch += 1;
    var wait = saving;
    return wait.then(function () {
      GolfLabPassphrase.dropInput();
      if (kind === "swap") {
        var sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
        var lookup = sw && typeof sw.getRegistration === "function" ? sw.getRegistration() : Promise.resolve(reg);
        return Promise.resolve(lookup).then(function (r) {
          var w = (r && r.waiting) || (reg && reg.waiting);
          if (!w) return;
          requested = true;
          w.postMessage({ type: "golflab-activate" });
        }).catch(function () {});
      }
      if (!reloading) {
        reloading = true;
        location.reload();
      }
    });
  }

  function watchWorker(r) {
    var sw = navigator.serviceWorker;
    r.addEventListener("updatefound", function () {
      var w = r.installing;
      if (!w) return;
      w.addEventListener("statechange", function () {
        if (w.state !== "installed" || !sw.controller) return;
        var ep = epoch;
        readState().then(function (st) {
          if (!st.ok) return;
          runSteps(GolfLabDecide.onSwap(st.s, "waiting"), { epoch: ep, g0: st.g, rec: st.rec, s: st.s, cands: {} });
        });
      });
    });
    if (watched) return;
    watched = true;
    sw.addEventListener("controllerchange", function () {
      if (requested) {
        if (channel) {
          try { channel.postMessage({ type: "reload" }); } catch (e) {   }
        }
        if (!reloading) {
          reloading = true;
          location.reload();
        }
        return;
      }
      if (!hadController) {
        hadController = !!sw.controller;
        return;
      }
      var ep = epoch;
      readState().then(function (st) {
        if (!st.ok) return;
        runSteps(GolfLabDecide.onSwap(st.s, "notice"), { epoch: ep, g0: st.g, rec: st.rec, s: st.s, cands: {} });
      });
    });
  }

  function register() {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    var sw = navigator.serviceWorker;
    hadController = !!sw.controller;
    var url = SW_URL;
    try {
      if (window.trustedTypes && typeof window.trustedTypes.createPolicy === "function") {
        if (!policy) {
          policy = window.trustedTypes.createPolicy(POLICY, {
            createScriptURL: function (u) {
              if (u === SW_URL) return u;
              throw new TypeError("許していない URL");
            },
          });
        }
        url = policy.createScriptURL(SW_URL);
      }
      sw.register(url, { scope: "./", updateViaCache: "none" }).then(function (r) {
        reg = r;
        watchWorker(r);
      }, function () {});
    } catch (e) {
    }
  }

  function start() {
    try {
      if (window.top !== window) return;
    } catch (e) {
      return;
    }
    var P = GolfLabPassphrase;
    P.build(document);
    var hasCrypto = typeof crypto !== "undefined" && crypto && crypto.subtle;
    if (!hasCrypto || typeof indexedDB === "undefined" || !indexedDB || typeof TextDecoder === "undefined") {
      P.say("noCrypto");
      return;
    }
    GolfLabStore.purgeOld();
    GolfLabStore.open().then(function () { P.eraseReady(GolfLabStore.isOpen()); }, function () {});
    register();
    if (typeof BroadcastChannel === "function") {
      try {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = function (e) { onNotice(e ? e.data : null); };
      } catch (e) {
        channel = null;
      }
    }
    window.addEventListener("pageshow", function (e) {
      away = false;
      if (e && e.persisted) onOpenPath(false);
    });
    window.addEventListener("pagehide", function () {
      away = true;
      onHide();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        away = true;
        onHide();
      } else if (document.visibilityState === "visible") {
        away = false;
        onOpenPath(false);
      }
    });
    onOpenPath(false);
  }

  start();

  return Object.freeze({
    listen: listen,
    onPass: onPass,
    erase: erase,
  });
})();
