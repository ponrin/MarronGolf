"use strict";

(function () {
  const TABS = { shots: "ショット情報", clubs: "クラブ情報", sim: "シミュレーション", help: "使い方" };
  const SUBS = ["graph", "table"];

  function parse() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    const [tab, sub] = h.split("/");
    if (!Object.prototype.hasOwnProperty.call(TABS, tab)) return { tab: "shots", sub: "graph" };
    return { tab, sub: tab === "shots" && SUBS.includes(sub) ? sub : "graph" };
  }

  let last = null;
  function apply() {
    const { tab, sub } = parse();
    for (const p of document.querySelectorAll(".tab-panel")) {
      const on = p.dataset.tab === tab;
      p.classList.toggle("is-active", on);
      p.setAttribute("aria-hidden", String(!on));
    }
    for (const a of document.querySelectorAll(".tabbar a[data-tab]")) {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    for (const p of document.querySelectorAll(".sub-panel")) p.classList.toggle("is-active", p.dataset.sub === sub);
    for (const a of document.querySelectorAll(".subseg a[data-sub]")) a.setAttribute("aria-current", String(a.dataset.sub === sub));
    const title = document.getElementById("tab-title");
    if (title) title.textContent = TABS[tab];
    document.title = "GolfLab · " + TABS[tab];
    const key = tab + "/" + sub;
    if (last !== null && last !== key) window.scrollTo(0, 0);
    last = key;
  }

  for (const a of document.querySelectorAll(".tabbar a[data-tab]")) {
    a.addEventListener("click", (e) => {
      if (parse().tab === a.dataset.tab && location.hash.replace(/^#/, "").split("/")[0] === a.dataset.tab) {
        if (!location.hash.includes("/")) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      }
    });
  }

  window.addEventListener("hashchange", apply);
  apply();
})();
