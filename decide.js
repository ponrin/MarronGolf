var GolfLabDecide = (function () {
  "use strict";

  var STEPS = Object.freeze([
    "homeHint", "drawStored", "fetch", "showSwitching", "showOfflineFirst", "showOfflineNewVersion",
    "noteFetchFailed", "hide", "ask", "askAgain", "savePair", "saveKey", "drawSaved", "keep", "wait",
    "checkUpdate", "swapShell", "reloadOnce", "redecide", "discard",
  ]);
  var ROWS = Object.freeze([
    "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14",
  ]);
  var FETCH_STATUS = ["failed", "unreadable", "locked", "noOpen", "opened"];
  var TRY_STATUS = ["opened", "noOpen", "unreadable", "skipped"];
  var SAVE_RESULTS = ["ok", "stale", "failed"];
  var SWAP_WHY = ["waiting", "notice"];

  function result(row, rows, steps, pick) {
    return {
      ok: true,
      row: row,
      rows: rows ? rows.slice() : (row ? [row] : []),
      steps: steps.slice(),
      pick: pick || null,
    };
  }

  function checkState(s) {
    if (!s || typeof s !== "object") return { ok: false, reason: "状態が無い" };
    if (typeof s.shellV !== "string" || s.shellV === "") return { ok: false, reason: "殻の版が無い" };
    var stored = s.stored;
    if (stored !== null) {
      if (!stored || typeof stored !== "object") return { ok: false, reason: "保存の記録の形が外" };
      if (typeof stored.ver !== "string" || stored.ver === "") return { ok: false, reason: "保存の記録の版が外" };
      if (!Number.isInteger(stored.n) || stored.n < 1) return { ok: false, reason: "保存の記録の番号が外" };
    }
    if (typeof s.hasKey !== "boolean") return { ok: false, reason: "鍵の有無が無い" };
    var flags = ["standalone", "workerWaiting", "cancelled", "eraseFailed", "gMoved"];
    var out = {};
    for (var i = 0; i < flags.length; i++) {
      var v = s[flags[i]];
      if (v === undefined) v = false;
      if (typeof v !== "boolean") return { ok: false, reason: "状態の印の形が外" };
      out[flags[i]] = v;
    }
    out.ok = true;
    out.shellV = s.shellV;
    out.stored = stored === null ? null : { ver: stored.ver, n: stored.n };
    out.hasKey = s.hasKey && out.stored !== null;
    out.kind = out.stored === null ? "none" : (out.stored.ver === out.shellV ? "V" : "prev");
    return out;
  }

  function checkFetched(st, f, isTry) {
    if (!f || typeof f !== "object") return { ok: false, reason: "取った結果の形が外" };
    var allowed = isTry ? TRY_STATUS : FETCH_STATUS;
    if (allowed.indexOf(f.status) < 0) return { ok: false, reason: "取った結果の言葉が外" };
    if (!isTry) {
      if (st.hasKey && f.status === "locked") return { ok: false, reason: "鍵があるのに解いていない" };
      if (!st.hasKey && (f.status === "noOpen" || f.status === "opened")) {
        return { ok: false, reason: "鍵が無いのに解いた結果がある" };
      }
    }
    var c = { status: f.status, ver: null, n: null, sameBytes: false };
    if (isTry) {
      if (f.from !== "stored" && f.from !== "fetched") return { ok: false, reason: "試した物の出所が外" };
      c.from = f.from;
    }
    if (f.status === "opened" || f.status === "noOpen" || f.status === "locked") {
      if (!Number.isInteger(f.n) || f.n < 1) return { ok: false, reason: "取った記録の番号が外" };
      c.n = f.n;
    }
    if (f.status === "opened") {
      if (f.ver !== undefined && f.ver !== null && typeof f.ver !== "string") {
        return { ok: false, reason: "取った記録の版の形が外" };
      }
      c.ver = typeof f.ver === "string" ? f.ver : null;
    }
    if (f.sameBytes !== undefined && typeof f.sameBytes !== "boolean") {
      return { ok: false, reason: "同じ bytes の印の形が外" };
    }
    c.sameBytes = f.sameBytes === true;
    return c;
  }

  function rowsAtOpen(st) {
    if (st.kind === "none") return ["D1", "D2", "D10"];
    if (st.kind === "V") return st.hasKey ? ["D3", "D4", "D5", "D10"] : ["D11", "D12", "D10"];
    return st.hasKey ? ["D7", "D8", "D9", "D10"] : ["D8", "D12", "D10"];
  }

  function tailD10(st, afterPass) {
    if (st.kind === "V" && st.hasKey) return afterPass ? ["ask", "keep"] : ["keep"];
    if (st.kind === "V") return afterPass ? ["ask"] : [];
    return ["wait"];
  }

  function withHint(st, steps) {
    return st.standalone ? steps : ["homeHint"].concat(steps);
  }

  function canReplace(s, c) {
    var st = checkState(s);
    if (!st.ok || !c || typeof c !== "object") return "no";
    if (c.status !== "opened" || typeof c.ver !== "string" || c.ver !== st.shellV) return "no";
    if (!Number.isInteger(c.n) || c.n < 1) return "no";
    if (st.stored === null) return "replace";
    if (c.n > st.stored.n) return "replace";
    if (!st.hasKey && c.n === st.stored.n && c.sameBytes === true) return "keyOnly";
    return "no";
  }

  function onOpen(s) {
    var st = checkState(s);
    if (!st.ok) return st;
    if (st.eraseFailed) {
      return st.workerWaiting ? result("D14", null, ["swapShell"], null) : result(null, [], [], null);
    }
    if (st.workerWaiting) {
      var swapSteps = st.kind === "V" && st.hasKey ? ["drawStored", "swapShell"] : ["swapShell"];
      return result("D14", null, withHint(st, swapSteps), null);
    }
    var steps;
    if (st.kind === "none") steps = ["fetch"];
    else if (st.kind === "V") steps = st.hasKey ? ["drawStored", "fetch"] : ["hide", "ask", "fetch"];
    else steps = st.hasKey ? ["showSwitching", "fetch"] : ["hide", "fetch"];
    return result(null, rowsAtOpen(st), withHint(st, steps), null);
  }

  function onFetched(s, f) {
    var st = checkState(s);
    if (!st.ok) return st;
    if (st.gMoved && !st.cancelled && !st.eraseFailed) return result(null, [], ["discard", "redecide"], null);
    var c = checkFetched(st, f, false);
    if (c.ok === false) return c;
    if (st.cancelled) return result(null, [], ["discard"], null);
    if (st.eraseFailed) return result(null, [], [], null);
    if (c.status === "unreadable" || (c.status === "opened" && c.ver !== st.shellV)) {
      return result("D10", null, ["checkUpdate"].concat(tailD10(st, false)), null);
    }
    var take = canReplace(s, c) === "replace";
    if (st.kind === "none") {
      if (c.status === "failed") return result("D2", null, ["showOfflineFirst"], null);
      return result("D1", null, ["ask"], null);
    }
    if (st.kind === "V" && st.hasKey) {
      if (c.status === "failed") return result("D4", null, ["noteFetchFailed", "keep"], null);
      if (c.status === "noOpen") return result("D5", null, ["checkUpdate", "ask", "keep"], null);
      return take ? result("D3", null, ["savePair"], "fetched") : result("D3", null, ["keep"], null);
    }
    if (st.kind === "prev" && st.hasKey) {
      if (c.status === "failed") return result("D8", null, ["showOfflineNewVersion"], null);
      if (c.status === "noOpen") return result("D9", null, ["checkUpdate", "ask"], null);
      return take ? result("D7", null, ["savePair"], "fetched") : result("D7", null, ["wait"], null);
    }
    if (st.kind === "V") {
      if (c.status === "failed") return result("D11", null, [], null);
      return result("D12", null, [], null);
    }
    if (c.status === "failed") return result("D8", null, ["showOfflineNewVersion"], null);
    return result("D12", null, ["ask"], null);
  }

  function onPassphrase(s, tries) {
    var st = checkState(s);
    if (!st.ok) return st;
    if (st.gMoved && !st.cancelled && !st.eraseFailed) return result(null, [], ["discard", "redecide"], null);
    if (!Array.isArray(tries)) return { ok: false, reason: "試した物の並びが外" };
    var items = { stored: null, fetched: null };
    for (var i = 0; i < tries.length; i++) {
      var c = checkFetched(st, tries[i], true);
      if (c.ok === false) return c;
      if (items[c.from]) return { ok: false, reason: "試した物の出所が重なる" };
      items[c.from] = c;
    }
    if (st.cancelled) return result(null, [], ["discard"], null);
    if (st.eraseFailed) return result(null, [], [], null);

    var fetched = items.fetched;
    var fetchedOther = !!fetched && fetched.status === "opened" && fetched.ver !== st.shellV;
    var check = !!fetched && (fetched.status === "unreadable" || fetchedOther);
    var head = check ? ["checkUpdate"] : [];
    var best = null;
    var bestHow = "no";
    var openedV = false;
    var order = ["stored", "fetched"];
    for (var k = 0; k < order.length; k++) {
      var it = items[order[k]];
      if (!it) continue;
      if (it.status === "opened" && it.ver === st.shellV) openedV = true;
      var how = canReplace(s, it);
      if (how === "no") continue;
      if (!best || it.n > best.n) {
        best = it;
        bestHow = how;
      }
    }
    var rowName;
    if (!st.hasKey && st.kind !== "none") {
      rowName = st.kind === "V" && !fetched ? "D11" : "D12";
    } else if (st.kind === "none") {
      rowName = "D1";
    } else {
      rowName = st.kind === "V" ? "D5" : "D9";
    }
    if (best) {
      var save = bestHow === "replace" ? "savePair" : "saveKey";
      return result(rowName, null, head.concat([save]), best.from);
    }
    if (!openedV && fetchedOther) return result("D10", null, ["checkUpdate"].concat(tailD10(st, true)), null);
    var rest;
    if (rowName === "D1") rest = ["askAgain"];
    else if (rowName === "D5") rest = openedV ? ["ask", "keep"] : ["askAgain", "keep"];
    else if (rowName === "D9") rest = openedV ? ["wait"] : ["askAgain"];
    else if (rowName === "D11") rest = ["hide", "askAgain"];
    else rest = openedV ? ["hide", "wait"] : ["hide", "askAgain"];
    return result(rowName, null, head.concat(rest), null);
  }

  function onSaved(s, r) {
    var st = checkState(s);
    if (!st.ok) return st;
    if (SAVE_RESULTS.indexOf(r) < 0) return { ok: false, reason: "保存の結果の言葉が外" };
    if (st.gMoved && !st.cancelled && !st.eraseFailed) return result(null, [], ["discard", "redecide"], null);
    if (st.cancelled) return result(null, [], ["discard"], null);
    if (st.eraseFailed) return result(null, [], [], null);
    if (r === "ok") return result(null, [], ["drawSaved"], null);
    if (r === "stale") return result("D13", null, ["redecide"], null);
    return result(null, [], ["redecide"], null);
  }

  function onSwap(s, why) {
    var st = checkState(s);
    if (!st.ok) return st;
    if (SWAP_WHY.indexOf(why) < 0) return { ok: false, reason: "入れ替えの言葉が外" };
    return result(null, [], [why === "waiting" ? "swapShell" : "reloadOnce"], null);
  }

  return Object.freeze({
    STEPS: STEPS,
    onOpen: onOpen,
    onFetched: onFetched,
    onPassphrase: onPassphrase,
    onSaved: onSaved,
    onSwap: onSwap,
    canReplace: canReplace,
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = GolfLabDecide;
