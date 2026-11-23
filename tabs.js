"use strict";

const GolfLabTabs = (() => {
  const TABS = { shots: "ショット情報", clubs: "クラブ情報", sim: "シミュレーション", help: "使い方" };
  const SUBS = ["graph", "table"];
  const GRAPH = { tab: "shots", sub: "graph" };
  let current = GRAPH;
  let onShow = null;

  function parseHash(hash) {
    const h = typeof hash === "string" ? hash : "";
    if (h === "#shots") return { tab: "shots", sub: "graph" };
    if (h === "#shots/table") return { tab: "shots", sub: "table" };
    if (h === "#clubs" || h === "#sim" || h === "#help") return { tab: h.slice(1), sub: "graph" };
    return { tab: GRAPH.tab, sub: GRAPH.sub };
  }

  function show(view) {
    const v = view && Object.prototype.hasOwnProperty.call(TABS, view.tab) ? view : GRAPH;
    const sub = SUBS.includes(v.sub) ? v.sub : "graph";
    for (const p of document.querySelectorAll("section.tab-panel[data-tab]")) {
      p.classList.toggle("is-active", p.getAttribute("data-tab") === v.tab);
    }
    for (const p of document.querySelectorAll("div.sub-panel[data-sub]")) {
      p.classList.toggle("is-active", p.getAttribute("data-sub") === sub);
    }
    for (const a of document.querySelectorAll("a[data-tab]")) {
      if (a.getAttribute("data-tab") === v.tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    for (const a of document.querySelectorAll("a[data-sub]")) {
      a.setAttribute("aria-current", String(a.getAttribute("data-sub") === sub));
    }
    const title = document.getElementById("tab-title");
    if (title) title.textContent = TABS[v.tab];
    current = { tab: v.tab, sub };
  }

  function ready(fn) {
    const bar = document.getElementById("tabbar");
    if (bar) bar.hidden = false;
    if (typeof fn === "function") onShow = fn;
  }

  show(parseHash(location.hash));

  window.addEventListener("hashchange", () => {
    show(parseHash(location.hash));
    window.scrollTo(0, 0);
    if (onShow) onShow({ tab: current.tab, sub: current.sub });
  });

  for (const a of document.querySelectorAll("a[data-tab]")) {
    a.addEventListener("click", (e) => {
      if (a.getAttribute("data-tab") !== current.tab) return;
      e.preventDefault();
      window.scrollTo(0, 0);
    });
  }
  for (const a of document.querySelectorAll("a[data-sub]")) {
    a.addEventListener("click", (e) => {
      if (current.tab !== "shots" || a.getAttribute("data-sub") !== current.sub) return;
      e.preventDefault();
      window.scrollTo(0, 0);
    });
  }

  return Object.freeze({ parseHash, show, ready });
})();
