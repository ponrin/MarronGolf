var GolfLabSettings = (function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var IDS = Object.freeze({
    open: "golflab-settings-open", sheet: "golflab-settings", title: "golflab-settings-title",
    close: "golflab-settings-close", erase: "golflab-settings-erase",
  });
  var BACKDROP_CLASS = "golflab-settings-backdrop";
  var PANEL_CLASS = "golflab-settings-panel";
  var OPEN_LABEL = "設定";
  var TITLE_TEXT = "設定";
  var CLOSE_TEXT = "閉じる";
  var KEY_HEAD = "この端末の鍵";
  var KEY_TEXT = "この端末に覚えた鍵を消すと、記録を隠して、すぐに合言葉を聞くよ。";
  var HOME_HEAD = "ホーム画面に置く";
  var HOME_TEXT = "Safari の共有 → 「ホーム画面に追加」で、ホーム画面のアイコンから開けるよ。";
  var GEAR_PATH = "M10.2 4.7 L10.7 2.1 L13.3 2.1 L13.8 4.7 L15.9 5.6 L18.1 4.1 L19.9 5.9 L18.4 8.1 L19.3 10.2 L21.9 10.7 " +
    "L21.9 13.3 L19.3 13.8 L18.4 15.9 L19.9 18.1 L18.1 19.9 L15.9 18.4 L13.8 19.3 L13.3 21.9 L10.7 21.9 L10.2 19.3 " +
    "L8.1 18.4 L5.9 19.9 L4.1 18.1 L5.6 15.9 L4.7 13.8 L2.1 13.3 L2.1 10.7 L4.7 10.2 L5.6 8.1 L4.1 5.9 L5.9 4.1 L8.1 5.6 Z";

  var refs = null;

  function build() {
    if (refs || typeof document === "undefined") return;
    var doc = document;
    var bar = doc.querySelector("header.appbar");
    if (!bar || !doc.body || doc.getElementById(IDS.sheet)) return;
    var make = function (tag, attrs, text) {
      var e = doc.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) e.textContent = text;
      return e;
    };
    var gear = make("button", {
      id: IDS.open, type: "button", "aria-label": OPEN_LABEL, "aria-haspopup": "dialog",
      "aria-controls": IDS.sheet, "aria-expanded": "false",
    });
    var icon = doc.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    var teeth = doc.createElementNS(SVG_NS, "path");
    teeth.setAttribute("d", GEAR_PATH);
    var hole = doc.createElementNS(SVG_NS, "circle");
    hole.setAttribute("cx", "12");
    hole.setAttribute("cy", "12");
    hole.setAttribute("r", "3");
    icon.appendChild(teeth);
    icon.appendChild(hole);
    gear.appendChild(icon);

    var sheet = make("div", { id: IDS.sheet, role: "dialog", "aria-modal": "true", "aria-labelledby": IDS.title });
    sheet.hidden = true;
    var backdrop = make("div", { "class": BACKDROP_CLASS });
    var panel = make("div", { "class": PANEL_CLASS });
    var head = make("div", { "class": "golflab-settings-head" });
    var closeBtn = make("button", { id: IDS.close, type: "button" }, CLOSE_TEXT);
    head.appendChild(make("h2", { id: IDS.title }, TITLE_TEXT));
    head.appendChild(closeBtn);
    var keyPart = make("section", { "class": "golflab-settings-part" });
    keyPart.appendChild(make("h3", null, KEY_HEAD));
    keyPart.appendChild(make("p", null, KEY_TEXT));
    keyPart.appendChild(make("div", { id: IDS.erase }));
    var homePart = make("section", { "class": "golflab-settings-part" });
    homePart.appendChild(make("h3", null, HOME_HEAD));
    homePart.appendChild(make("p", null, HOME_TEXT));
    panel.appendChild(head);
    panel.appendChild(keyPart);
    panel.appendChild(homePart);
    sheet.appendChild(backdrop);
    sheet.appendChild(panel);

    bar.appendChild(gear);
    doc.body.appendChild(sheet);
    refs = { doc: doc, open: gear, sheet: sheet, close: closeBtn };
    gear.addEventListener("click", () => { open(); });
    closeBtn.addEventListener("click", () => { close(); });
    backdrop.addEventListener("click", () => { close(); });
    doc.addEventListener("keydown", (e) => {
      if (e && e.key === "Escape" && refs && !refs.sheet.hidden) close();
    });
  }

  function open() {
    if (!refs) return;
    refs.sheet.hidden = false;
    refs.open.setAttribute("aria-expanded", "true");
    if (typeof refs.close.focus === "function") refs.close.focus();
  }

  function close() {
    if (!refs || refs.sheet.hidden) return;
    refs.sheet.hidden = true;
    refs.open.setAttribute("aria-expanded", "false");
    if (typeof refs.open.focus === "function") refs.open.focus();
  }

  function eraseSlot() {
    if (!refs) return null;
    return refs.doc.getElementById(IDS.erase) || null;
  }

  build();

  return Object.freeze({
    eraseSlot: eraseSlot,
    close: close,
  });
})();
