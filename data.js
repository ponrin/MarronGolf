"use strict";

var GolfLabTable = (function () {
  const LABELS = { "50deg": "50°", "56deg": "56°", "48deg": "48°", "52deg": "52°" };
  const clubLabel = (c) => LABELS[c] || c;
  const fmtV = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function wireInfo(root) {
    for (const b of root.querySelectorAll("button.info[data-for]")) {
      if (b.dataset.wired) continue;
      b.dataset.wired = "1";
      b.addEventListener("click", () => {
        const box = document.getElementById(b.dataset.for);
        if (!box) return;
        box.hidden = !box.hidden;
        b.setAttribute("aria-expanded", String(!box.hidden));
      });
    }
  }

  function rowsOf(data) {
    const rank = (c) => { const i = (data.order || []).indexOf(c); return i < 0 ? 999 : i; };
    return data.shots.slice().sort((a, b) => rank(a.club) - rank(b.club) || String(a.shot_id).localeCompare(String(b.shot_id)));
  }

  let DATA = null;
  let ON_CHANGE = null;
  let BUTTONS = [];
  let ROWS = [];
  let mounted = false;
  let dropped = false;

  function cellTitle(s, f, unit, digits, flag) {
    const used = isCellUsed(s, f);
    return `${s.shot_id} · ${cellLabel(f)} ${fmtV(s[f], digits)}${unit ? " " + unit : ""}` +
      (flag ? ` · 候補: ${flag}` : "") + (used ? " · 使う (押すと使わない)" : " · 使わない (押すと使う)");
  }

  function paint() {
    for (const [b, s, f, flag, unit, digits] of BUTTONS) {
      const used = isCellUsed(s, f);
      b.classList.toggle("off", !used);
      b.setAttribute("aria-pressed", String(!used));
      b.title = cellTitle(s, f, unit, digits, flag);
    }
    for (const [b, tr, s] of ROWS) {
      const allOff = CELL_FIELDS.every(([f]) => !isCellUsed(s, f));
      b.classList.toggle("off", allOff);
      tr.classList.toggle("row-off", allOff);
      b.setAttribute("aria-pressed", String(allOff));
      b.title = (s.source_image ? s.source_image + " · " : "") + (allOff ? "1 球まるごと使わない (押すと全部戻す)" : "押すと 1 球まるごと使わない");
    }
  }

  function changed(data, notify) {
    paint();
    const off = cellsOff(data);
    const tag = document.getElementById("off-count");
    tag.hidden = off.length === 0;
    tag.textContent = `外した ${off.length}`;
    tag.title = off.map(([id, f]) => `${id} ${cellLabel(f)}`).join(", ");
    if (notify && typeof ON_CHANGE === "function") ON_CHANGE();
  }

  function render(data) {
    const rows = rowsOf(data);
    const table = el("table", "cells");
    const head = el("tr");
    for (const [t, cls] of [["番手", "l"], ["球", "l"], ["日付", "l"]]) head.appendChild(el("th", cls, t));
    for (const [, label, unit] of CELL_FIELDS) {
      const th = el("th", "", label);
      if (unit) th.appendChild(el("span", "u", unit));
      head.appendChild(th);
    }
    const thead = el("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = el("tbody");
    table.appendChild(tbody);
    document.getElementById("table").appendChild(table);
    let prev = null;
    for (const s of rows) {
      const tr = el("tr", s.club !== prev ? "club-first" : "");
      tr.appendChild(el("td", "l club", s.club !== prev ? clubLabel(s.club) : ""));
      prev = s.club;
      const idTd = el("td", "l id");
      const idB = el("button", "", s.shot_id);
      idB.type = "button";
      idB.addEventListener("click", () => { if (dropped) return; toggleShot(data, s); changed(data, true); });
      ROWS.push([idB, tr, s]);
      idTd.appendChild(idB);
      tr.appendChild(idTd);
      tr.appendChild(el("td", "l sub", s.capture_date || "—"));
      const cf = candField(s.review_flag);
      for (const [f, , unit, digits] of CELL_FIELDS) {
        const td = el("td", "v");
        const b = el("button", "", fmtV(s[f], digits));
        b.type = "button";
        b.dataset.shot = String(s.shot_id);
        b.dataset.field = f;
        const flag = cf === f ? s.review_flag : null;
        if (flag) b.classList.add("cand");
        b.addEventListener("click", () => { if (dropped) return; toggleCell(data, s.shot_id, f); changed(data, true); });
        BUTTONS.push([b, s, f, flag, unit, digits]);
        td.appendChild(b);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    document.getElementById("table-counts").textContent = `${rows.length} 球 · 候補 ${cellCandidates(data).length} ます`;
  }

  function mount(data, onChange) {
    if (mounted || dropped) return;
    mounted = true;
    DATA = data;
    ON_CHANGE = onChange;
    render(data);
    changed(data);
    document.getElementById("off-cand").addEventListener("click", () => { if (dropped) return; offCandidates(DATA); changed(DATA, true); });
    document.getElementById("on-all").addEventListener("click", () => { if (dropped) return; clearCells(); changed(DATA, true); });
  }

  function repaint() {
    if (!mounted || dropped) return;
    changed(DATA);
  }

  function drop() {
    dropped = true;
    const table = document.getElementById("table");
    if (table) while (table.firstChild) table.removeChild(table.firstChild);
    for (const id of ["table-counts", "off-count"]) {
      const n = document.getElementById(id);
      if (n) { n.textContent = ""; n.title = ""; }
    }
    DATA = null;
    ON_CHANGE = null;
    BUTTONS = [];
    ROWS = [];
  }

  const box = document.getElementById("table-box");
  if (box) wireInfo(box);

  return Object.freeze({ mount, repaint, drop, rowsOf, cellTitle, clubLabel, fmtV });
})();
