"use strict";

var ShotsTable = (function () {
  const LABELS_T = { "50deg": "50°", "56deg": "56°", "48deg": "48°", "52deg": "52°" };
  const clubLabelT = (c) => LABELS_T[c] || c;
  const fmtV = (v, d) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  const BUTTONS = [];
  const ROWS = [];
  let DATA = null;
  let ON_CHANGE = null;

  function rowsOf(data) {
    const rank = (c) => { const i = (data.order || []).indexOf(c); return i < 0 ? 999 : i; };
    return data.shots.slice().sort((a, b) => rank(a.club) - rank(b.club) || String(a.shot_id).localeCompare(String(b.shot_id)));
  }

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
    if (!DATA) return;
    const off = cellsOff(DATA);
    const tag = document.getElementById("tbl-off-count");
    tag.hidden = off.length === 0;
    tag.textContent = `外した ${off.length}`;
    tag.title = off.map(([id, f]) => `${id} ${cellLabel(f)}`).join(", ");
  }

  function changed() {
    paint();
    if (ON_CHANGE) ON_CHANGE();
  }

  function render(data) {
    const rows = rowsOf(data);
    const table = mk("table", "cells");
    const head = mk("tr");
    for (const [t, cls] of [["番手", "l"], ["球", "l"], ["日付", "l"]]) head.appendChild(mk("th", cls, t));
    for (const [, label, unit] of CELL_FIELDS) {
      const th = mk("th", "", label);
      if (unit) th.appendChild(mk("span", "u", unit));
      head.appendChild(th);
    }
    const thead = mk("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = mk("tbody");
    let prev = null;
    for (const s of rows) {
      const tr = mk("tr", s.club !== prev ? "club-first" : "");
      tr.appendChild(mk("td", "l club", s.club !== prev ? clubLabelT(s.club) : ""));
      prev = s.club;
      const idTd = mk("td", "l id");
      const idB = mk("button", "", s.shot_id);
      idB.type = "button";
      idB.addEventListener("click", () => { toggleShot(data, s); changed(); });
      ROWS.push([idB, tr, s]);
      idTd.appendChild(idB);
      tr.appendChild(idTd);
      tr.appendChild(mk("td", "l sub", s.capture_date || "—"));
      const cf = candField(s.review_flag);
      for (const [f, , unit, digits] of CELL_FIELDS) {
        const td = mk("td", "v");
        const b = mk("button", "", fmtV(s[f], digits));
        b.type = "button";
        b.dataset.shot = String(s.shot_id);
        b.dataset.field = f;
        const flag = cf === f ? s.review_flag : null;
        if (flag) b.classList.add("cand");
        b.addEventListener("click", () => { toggleCell(data, s.shot_id, f); changed(); });
        BUTTONS.push([b, s, f, flag, unit, digits]);
        td.appendChild(b);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    document.getElementById("tbl-table").appendChild(table);
    document.getElementById("tbl-counts").textContent = `${rows.length} 球 · 候補 ${cellCandidates(data).length} ます`;
  }

  function mount(data, onChange) {
    if (DATA) return;
    DATA = data;
    ON_CHANGE = onChange;
    render(data);
    paint();
    document.getElementById("tbl-off-cand").addEventListener("click", () => { offCandidates(data); changed(); });
    document.getElementById("tbl-on-all").addEventListener("click", () => { clearCells(); changed(); });
  }

  return { mount, repaint: paint };
})();
