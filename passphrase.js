var GolfLabPassphrase = (function () {
  "use strict";

  var TEXTS = Object.freeze({
    hint: "ホーム画面に追加してね",
    switching: "新しい版に替えています",
    offlineFirst: "電波のある所で開いてね",
    offlineNewVersion: "新しい版になったので、電波のある所で 1 回開いてね",
    fetchFailed: "新しい記録を取れなかった (前の記録を見せているよ)",
    checking: "確かめています…",
    empty: "合言葉が空だよ。",
    wrong: "合言葉が違うか、記録が壊れている。もう一度入れてね。",
    noCrypto: "このブラウザでは暗号の機能が使えない (https で開いてね)",
    saveFailed: "保存できなかった。開き直してね",
    eraseFailed: "鍵を消せなかった。歯車の設定から、もう一度押してね",
  });
  var ERROR_WORDS = Object.freeze(["empty", "wrong", "noCrypto", "saveFailed", "eraseFailed"]);
  var ERROR_CLASS = "golflab-error";
  var IDS = Object.freeze({
    gate: "golflab-gate", hint: "golflab-hint", msg: "golflab-msg", ask: "golflab-ask",
    pass: "golflab-pass", open: "golflab-open", erase: "golflab-erase",
  });
  var ASK_TEXT = "合言葉を入れてね。この端末では最初の 1 回だけ聞くよ。";
  var LABEL_TEXT = "合言葉";
  var OPEN_TEXT = "開く";
  var ERASE_TEXT = "鍵を消す";
  var CONFIRM_TEXT = "この端末に覚えた鍵を消す？ 消すと記録を隠して、すぐに合言葉を聞くよ。";

  var refs = null;

  function el(doc, tag, attrs, text) {
    var e = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function normalize(text) {
    if (typeof text !== "string") return "";
    return text.normalize("NFKC").replace(/\s+/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  }

  function submit() {
    if (!refs) return;
    var v = normalize(refs.pass.value);
    if (v === "") {
      say("empty");
      return;
    }
    refs.pass.disabled = true;
    refs.open.disabled = true;
    say("checking");
    refs.pass.value = "";
    if (typeof GolfLabGate !== "undefined" && GolfLabGate && typeof GolfLabGate.onPass === "function") {
      GolfLabGate.onPass(v);
    }
  }

  function onKey(e) {
    if (!e || e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    submit();
  }

  function onErase() {
    if (!refs) return;
    var win = refs.doc.defaultView || (typeof window !== "undefined" ? window : null);
    var ok = !!(win && typeof win.confirm === "function" && win.confirm(CONFIRM_TEXT));
    if (!ok) return;
    if (typeof GolfLabSettings !== "undefined" && GolfLabSettings && typeof GolfLabSettings.close === "function") {
      GolfLabSettings.close();
    }
    if (typeof GolfLabGate !== "undefined" && GolfLabGate && typeof GolfLabGate.erase === "function") {
      GolfLabGate.erase();
    }
  }

  function build(doc) {
    if (refs) return;
    var box = el(doc, "section", { id: IDS.gate });
    var hintEl = el(doc, "p", { id: IDS.hint }, "");
    hintEl.hidden = true;
    var msg = el(doc, "p", { id: IDS.msg, role: "status", "aria-live": "polite" }, "");
    var askBox = el(doc, "div", { id: IDS.ask });
    askBox.hidden = true;
    var pass = el(doc, "input", {
      id: IDS.pass, type: "password", autocomplete: "off", autocapitalize: "none", autocorrect: "off",
      spellcheck: "false", enterkeyhint: "go",
    });
    var openBtn = el(doc, "button", { id: IDS.open, type: "button" }, OPEN_TEXT);
    askBox.appendChild(el(doc, "p", null, ASK_TEXT));
    askBox.appendChild(el(doc, "label", { for: IDS.pass }, LABEL_TEXT));
    askBox.appendChild(pass);
    askBox.appendChild(openBtn);
    box.appendChild(msg);
    box.appendChild(askBox);
    var main = doc.querySelector("main");
    var parent = main || doc.body;
    parent.insertBefore(box, parent.firstChild);
    parent.insertBefore(hintEl, box);
    var eraseBtn = el(doc, "button", { id: IDS.erase, type: "button" }, ERASE_TEXT);
    eraseBtn.disabled = true;
    var slot = typeof GolfLabSettings !== "undefined" && GolfLabSettings && typeof GolfLabSettings.eraseSlot === "function"
      ? GolfLabSettings.eraseSlot() : null;
    (slot || box).appendChild(eraseBtn);
    openBtn.addEventListener("click", function () { submit(); });
    pass.addEventListener("keydown", function (e) { onKey(e); });
    eraseBtn.addEventListener("click", function () { onErase(); });
    refs = { doc: doc, box: box, hint: hintEl, msg: msg, ask: askBox, pass: pass, open: openBtn, erase: eraseBtn };
  }

  function ask(again) {
    if (!refs) return;
    refs.ask.hidden = false;
    refs.pass.disabled = false;
    refs.open.disabled = false;
    if (typeof refs.pass.focus === "function") refs.pass.focus();
    if (again === true) say("wrong");
    else if (refs.msg.textContent === TEXTS.checking) {
      refs.msg.textContent = "";
      refs.msg.classList.remove(ERROR_CLASS);
    }
  }

  function close(keepMsg) {
    if (!refs) return;
    refs.ask.hidden = true;
    if (keepMsg !== true || refs.msg.textContent === TEXTS.checking) {
      refs.msg.textContent = "";
      refs.msg.classList.remove(ERROR_CLASS);
    }
  }

  function dropInput() {
    if (!refs) return;
    refs.pass.value = "";
    refs.ask.hidden = true;
  }

  function say(word) {
    if (!refs || typeof word !== "string" || !Object.prototype.hasOwnProperty.call(TEXTS, word)) return;
    refs.msg.textContent = TEXTS[word];
    if (ERROR_WORDS.indexOf(word) >= 0) refs.msg.classList.add(ERROR_CLASS);
    else refs.msg.classList.remove(ERROR_CLASS);
  }

  function hint() {
    if (!refs) return;
    refs.hint.textContent = TEXTS.hint;
    refs.hint.hidden = false;
  }

  function eraseReady(on) {
    if (!refs) return;
    refs.erase.disabled = on !== true;
  }

  return Object.freeze({
    TEXTS: TEXTS,
    build: build,
    ask: ask,
    close: close,
    dropInput: dropInput,
    say: say,
    hint: hint,
    eraseReady: eraseReady,
    normalize: normalize,
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = GolfLabPassphrase;
