"use strict";

var GolfLabTopbar = (function () {
  const KEY = "golflab-topbar-trial";
  const MODES = ["a", "b", "c"];
  const root = document.documentElement;
  let mode = "b";
  try {
    const v = localStorage.getItem(KEY);
    if (MODES.includes(v)) mode = v;
  } catch (e) {
    mode = "b";
  }

  function bar() {
    return document.querySelector(".appbar, header.top");
  }
  function measure() {
    const b = bar();
    if (b) root.style.setProperty("--topbar-h", b.offsetHeight + "px");
  }
  function apply() {
    for (const m of MODES) root.classList.toggle("topbar-" + m, m === mode);
    measure();
  }
  function set(m) {
    if (!MODES.includes(m)) return;
    mode = m;
    try {
      localStorage.setItem(KEY, m);
    } catch (e) {
      mode = m;
    }
    apply();
  }

  apply();
  document.addEventListener("DOMContentLoaded", () => {
    measure();
    const b = bar();
    if (b && typeof ResizeObserver === "function") new ResizeObserver(measure).observe(b);
    window.addEventListener("resize", measure);
  });
  return Object.freeze({ set, mode: () => mode });
})();
