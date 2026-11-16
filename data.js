"use strict";

const LABELS = { "50deg": "50°", "56deg": "56°", "48deg": "48°", "52deg": "52°" };
const clubLabel = (c) => LABELS[c] || c;
const fmtV = (v, d) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
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
wireInfo(document);

function rowsOf(data) {
  const rank = (c) => { const i = (data.order || []).indexOf(c); return i < 0 ? 999 : i; };
  return data.shots.slice().sort((a, b) => rank(a.club) - rank(b.club) || String(a.shot_id).localeCompare(String(b.shot_id)));
}

const BUTTONS = [];
const ROWS = [];

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
  let prev = null;
  for (const s of rows) {
    const tr = el("tr", s.club !== prev ? "club-first" : "");
    tr.appendChild(el("td", "l club", s.club !== prev ? clubLabel(s.club) : ""));
    prev = s.club;
    const idTd = el("td", "l id");
    const idB = el("button", "", s.shot_id);
    idB.type = "button";
    idB.addEventListener("click", () => { toggleShot(data, s); changed(data); });
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
      b.addEventListener("click", () => { toggleCell(data, s.shot_id, f); changed(data); });
      BUTTONS.push([b, s, f, flag, unit, digits]);
      td.appendChild(b);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  document.getElementById("table").appendChild(table);
  document.getElementById("counts").textContent = `${rows.length} 球 · 候補 ${cellCandidates(data).length} ます`;
}

function changed(data) {
  paint();
  const off = cellsOff(data);
  const tag = document.getElementById("off-count");
  tag.hidden = off.length === 0;
  tag.textContent = `外した ${off.length}`;
  tag.title = off.map(([id, f]) => `${id} ${cellLabel(f)}`).join(", ");
}

function drawPage(data) {
  render(data);
  changed(data);
  document.getElementById("off-cand").addEventListener("click", () => { offCandidates(data); changed(data); });
  document.getElementById("on-all").addEventListener("click", () => { clearCells(); changed(data); });
  window.addEventListener("storage", (e) => { if (e.key === CELL_KEY) { cellsReload(); changed(data); } });
  window.addEventListener("pageshow", (e) => { if (e.persisted) { cellsReload(); changed(data); } });
}

const ON_GATE = typeof GolfLabGate !== "undefined";
let gateDrawn = false;
let gateReloading = false;

function draw(data, info) {
  if (gateReloading) return;
  if (gateDrawn) {
    if (info && info.redraw) {
      gateReloading = true;
      location.reload();
    }
    return;
  }
  gateDrawn = true;
  try {
    drawPage(data);
  } catch (e) {
    document.getElementById("error").textContent = "記録を描けないの (" + e.message + ")";
  }
}

function discard() {
  if (!gateDrawn || gateReloading) return;
  gateReloading = true;
  document.body.hidden = true;
  location.reload();
}

if (ON_GATE) {
  GolfLabGate.listen({ draw, discard });
} else {
fetch("data.json", { cache: "no-store" })
  .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
  .then(drawPage)
  .catch((e) => {
    document.getElementById("error").textContent = "data.json が読めないの (" + e.message + ")。Live Preview で開いているか確かめてね";
  });
}
