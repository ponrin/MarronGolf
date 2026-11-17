"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const LABELS = { "50deg": "50°", "56deg": "56°", "48deg": "48°", "52deg": "52°" };

const SHOW_KEY = "golflab-show-v1";
const SERIES = [["mine", "パパの記録 (点と平均)", "パパ"], ["total", "飛距離 (トータル)", "トータル"], ["pga", "PGA 平均", "PGA"],
  ["lpga", "LPGA 平均", "LPGA"]];
const SHOW = Object.fromEntries(SERIES.map(([k]) => [k, true]));
try {
  const saved = JSON.parse(localStorage.getItem(SHOW_KEY) || "{}");
  for (const k of Object.keys(SHOW)) if (typeof saved[k] === "boolean") SHOW[k] = saved[k];
} catch (e) {   }
function saveShow() {
  try { localStorage.setItem(SHOW_KEY, JSON.stringify(SHOW)); } catch (e) {   }
}
const tourKey = (t) => (/^LPGA/i.test(t.tour) ? "lpga" : "pga");
const GAP_WIDE = 15;
const GAP_TIGHT = 5;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function svg(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = String(text);
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
      for (const o of document.querySelectorAll(`button.info[data-for="${b.dataset.for}"]`)) o.setAttribute("aria-expanded", String(!box.hidden));
    });
  }
}
wireInfo(document);

const clubLabel = (c) => LABELS[c] || c;
const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
const flagged = (s) => s.review_flag && s.review_flag !== "review_not_required";
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

function dotPlot(data, opts) {
  const { field, unit, extraField, rowH = 24, step, digits = 1 } = opts;
  const showTotal = Boolean(extraField) && SHOW.total;
  const meanCols = !SHOW.mine ? [] : [[field, opts.meanLabel || "平均"]].concat(
    showTotal && opts.extraMeanLabel ? [[extraField, opts.extraMeanLabel]] : []);
  const labelW = 36, meanW = 36;
  const colX = (j) => labelW + meanW * (j + 1);
  const W = Math.max(320, Math.round(opts.width || 640)), left = (meanCols.length ? colX(meanCols.length - 1) : labelW) + 6, right = 12, top = 18, bottom = 22;
  const rows = data.order;
  const H = top + rows.length * rowH + bottom;
  const tour = (data.tour || []).filter((t) => t.club && Number.isFinite(t[field]) && SHOW[tourKey(t)]);
  const vals = (SHOW.mine ? data.shots.flatMap((s) => [s[field], showTotal ? s[extraField] : null]) : [])
    .concat(tour.map((t) => t[field])).filter((v) => Number.isFinite(v));
  if (vals.length === 0) {
    const empty = svg("svg", { viewBox: `0 0 ${W} 40`, role: "img" });
    empty.appendChild(svg("text", { x: 4, y: 24, class: "dim" }, "表示するものが選ばれていないの (上のチェックボックス)"));
    return empty;
  }
  const lo = opts.zero ? 0 : Math.floor(Math.min(...vals) / step) * step;
  const hi = Math.ceil(Math.max(...vals) / step) * step;
  const x = (v) => left + ((v - lo) / (hi - lo || 1)) * (W - left - right);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const grid = svg("g", { class: "grid" });
  const axis = svg("g", { class: "axis" });
  const every = Math.max(1, Math.ceil(30 / (((W - left - right) * step) / (hi - lo || 1))));
  let tick = 0;
  for (let v = lo; v <= hi + 1e-9; v += step, tick += 1) {
    grid.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: H - bottom }));
    if (tick % every === 0) axis.appendChild(svg("text", { x: x(v), y: H - 6, "text-anchor": "middle" }, String(Math.round(v * 10) / 10)));
  }
  axis.appendChild(svg("text", { x: 4, y: H - 6, "text-anchor": "start" }, unit));
  root.appendChild(grid);
  const links = svg("g", { class: "links" });
  root.appendChild(links);
  const linkPts = { mine: [], total: [], pga: [], lpga: [] };
  root.appendChild(svg("text", { x: 4, y: 12, class: "dim lc" }, "番手"));
  meanCols.forEach(([, label], j) => root.appendChild(svg("text", { x: colX(j), y: 12, "text-anchor": "end", class: "dim lc" }, label)));
  rows.forEach((club, i) => {
    const y = top + i * rowH + rowH / 2;
    if (i % 2 === 0) root.appendChild(svg("rect", { class: "row-bg", x: 0, y: top + i * rowH, width: W, height: rowH, opacity: 0.6 }));
    const clubText = svg("text", { x: 4, y: y + 4, class: "lc" }, clubLabel(club));
    root.appendChild(clubText);
    for (const t of tour.filter((t) => t.club === club)) {
      const cx = x(t[field]);
      linkPts[tourKey(t)].push([cx, y]);
      const d = /^LPGA/i.test(t.tour)
        ? `M${cx},${y - 6} L${cx + 6},${y + 4} L${cx - 6},${y + 4} Z`
        : `M${cx},${y - 6} L${cx + 6},${y} L${cx},${y + 6} L${cx - 6},${y} Z`;
      const mark = svg("path", { d, fill: css(/^LPGA/i.test(t.tour) ? "--lpga" : "--pga"), "fill-opacity": 0.9 });
      const tt = svg("title");
      tt.textContent = `${t.tour} 平均 (${t.source}${t.year ? " " + t.year : ""}) · ${t.tour_club || clubLabel(club)} · ${fmt(t[field])} ${unit}`;
      mark.appendChild(tt);
      root.appendChild(mark);
    }
    if (!SHOW.mine) return;
    const clubShots = data.shots.filter((s) => s.club === club);
    const shots = clubShots.filter((s) => Number.isFinite(s[field]));
    const means = meanCols.map(([key]) => {
      const vals = clubShots.filter((s) => isCellUsed(s, key)).map((s) => s[key]).filter((v) => Number.isFinite(v));
      return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : NaN;
    });
    if (shots.length === 0 && !means.some((v) => Number.isFinite(v))) {
      meanCols.forEach((_, j) => root.appendChild(svg("text", { x: colX(j), y: y + 4, "text-anchor": "end", class: "dim lc" }, "—")));
      root.appendChild(svg("text", { x: left + 4, y: y + 4, class: "dim" }, "未測定"));
      return;
    }
    means.forEach((avg, j) => root.appendChild(svg("text", { x: colX(j), y: y + 4, "text-anchor": "end", class: "lc", "font-weight": j === 0 ? 600 : 400 },
      Number.isFinite(avg) ? avg.toFixed(digits) : "—")));
    const jitterOf = (s) => (((shots.includes(s) ? shots.indexOf(s) : clubShots.indexOf(s)) % 3) - 1) * 4;
    if (showTotal) {
      for (const s of clubShots.filter((s) => Number.isFinite(s[extraField]))) {
        root.appendChild(svg("circle", { cx: x(s[extraField]), cy: y + jitterOf(s), r: 3, fill: "none", stroke: css("--total"), "stroke-width": 1.5,
          "stroke-opacity": isCellUsed(s, extraField) ? 1 : 0.3 }));
      }
    }
    const totals = showTotal ? clubShots.filter((s) => isCellUsed(s, extraField)).map((s) => s[extraField]).filter((v) => Number.isFinite(v)) : [];
    if (totals.length) linkPts.total.push([x(totals.reduce((a, v) => a + v, 0) / totals.length), y]);
    if (shots.length === 0) {
      root.appendChild(svg("text", { x: left + 4, y: y + 4, class: "dim" }, "未測定"));
      return;
    }
    const used = shots.filter((s) => isCellUsed(s, field));
    const nTitle = svg("title");
    nTitle.textContent = `${clubLabel(club)} · 使う球 ${used.length}`;
    clubText.appendChild(nTitle);
    shots.forEach((s) => {
      const off = !isCellUsed(s, field);
      const cx = x(s[field]), cy = y + jitterOf(s);
      const g = svg("g");
      const dot = svg("circle", { cx, cy, r: 5, fill: css("--accent"), "fill-opacity": off ? 0.18 : 0.85 });
      if (flagged(s)) {
        dot.setAttribute("stroke", css("--attention-em"));
        dot.setAttribute("stroke-width", 2.5);
        if (off) dot.setAttribute("stroke-opacity", 0.45);
      }
      g.appendChild(dot);
      if (off) {
        for (const [dx, dy] of [[4, 4], [4, -4]]) {
          g.appendChild(svg("line", { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, stroke: css("--fg-muted"), "stroke-width": 1.5 }));
        }
      }
      const t = svg("title");
      t.textContent = `${s.shot_id} · ${clubLabel(club)} · ${fmt(s[field])} ${unit}` +
        (extraField ? ` (トータル ${fmt(s[extraField])}${isCellUsed(s, extraField) ? "" : " · 使わない"})` : "") +
        (flagged(s) ? ` · 確認が必要: ${s.review_flag}` : "") + (off ? " · 使わない (表で選ぶ)" : "");
      g.appendChild(t);
      root.appendChild(g);
    });
    if (used.length === 0) return;
    const mean = used.reduce((a, s) => a + s[field], 0) / used.length;
    linkPts.mine.push([x(mean), y]);
    root.appendChild(svg("line", { x1: x(mean), x2: x(mean), y1: y - rowH / 2 + 3, y2: y + rowH / 2 - 3,
      stroke: css("--fg"), "stroke-width": 2, "pointer-events": "none" }));
  });
  for (const [key, color] of [["total", "--total"], ["lpga", "--lpga"], ["pga", "--pga"], ["mine", "--accent"]]) {
    if (linkPts[key].length < 2) continue;
    links.appendChild(svg("polyline", { points: linkPts[key].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" "),
      fill: "none", stroke: css(color), "stroke-width": 1.5, "stroke-dasharray": "4 3", "stroke-opacity": 0.75 }));
  }
  root.appendChild(axis);
  return root;
}

function renderGaps(data) {
  const box = document.getElementById("gaps");
  const means = data.order.map((c) => data.summary.find((r) => r.club === c)).filter((r) => r && r.n > 0 && r.carry_mean !== null);
  if (means.length < 2) {
    box.appendChild(el("div", "empty", "測った番手が 2 本以上になったら出すね"));
    return;
  }
  const missing = data.order.filter((c) => !means.some((r) => r.club === c));
  const table = el("table", "gaps");
  const maxGap = Math.max(...means.slice(1).map((r, i) => means[i].carry_mean - r.carry_mean), 1);
  for (let i = 1; i < means.length; i++) {
    const a = means[i - 1], b = means[i];
    const gap = a.carry_mean - b.carry_mean;
    const between = data.order.slice(data.order.indexOf(a.club) + 1, data.order.indexOf(b.club)).map(clubLabel);
    const tr = el("tr");
    tr.appendChild(el("td", "", `${clubLabel(a.club)} ${fmt(a.carry_mean, 0)} → ${clubLabel(b.club)} ${fmt(b.carry_mean, 0)}` +
      (between.length ? ` (間の ${between.join("・")} は未測定)` : "")));
    const cls = gap > GAP_WIDE ? "bar wide" : gap < GAP_TIGHT ? "bar tight" : "bar";
    const bar = el("td", cls);
    const fill = el("span");
    fill.style.width = (Math.max(0, gap) / maxGap * 100).toFixed(1) + "%";
    bar.appendChild(fill);
    tr.appendChild(bar);
    tr.appendChild(el("td", "val", fmt(gap, 0) + " yd"));
    table.appendChild(tr);
  }
  box.appendChild(table);
  const legend = el("div", "legend");
  legend.appendChild(el("span", "", `黄 = ${GAP_WIDE} yd より広い (隙間) · 赤 = ${GAP_TIGHT} yd より狭い (重なり気味)`));
  if (missing.length) legend.appendChild(el("span", "", "未測定: " + missing.map(clubLabel).join("・")));
  box.appendChild(legend);
}

const SHAFT_STATUS_JA = {
  user_reported: "申告", nominal_weight_unresolved: "未確定", prior_nominal_value_not_reverified: "公称 (未再確認)",
};
const MEASUREMENT_STATUS_JA = {
  "mass_and_balance_user_measured;length_lie_loft_sw_user_table_not_all_independently_measured":
    "重さとバランス点はパパの測定。長さ・ライ・ロフト・SW は表の記載で、全部を独立に測ったわけではない",
};
const KIND_JA = { "記": "記 = 表の記載値", "測": "測 = パパの測定値", "算": "算 = 計算 (Q14 = 重さ × (バランス点 − 35.56cm)・SW の元になる量)" };

const IN_USE_KEY = "golflab-in-use-v1";
let IN_USE = {};
try { const v = JSON.parse(localStorage.getItem(IN_USE_KEY) || "{}"); if (v && typeof v === "object") IN_USE = v; } catch (e) {   }
function saveInUse() {
  try { localStorage.setItem(IN_USE_KEY, JSON.stringify(IN_USE)); } catch (e) {   }
}

function specRows(data) {
  const mine = data.clubs.map((c) => ({ ...c, in_use: true }));
  const cands = ((data.swap || {}).candidates || []).map((c) => ({
    club: c.id, model: c.model, shaft: c.shaft, flex_reported: c.flex, loft_deg: c.loft_deg, length_in: c.length_in,
    lie_deg: c.lie_deg, total_mass_g: c.total_mass_g, balance_from_butt_cm: null, sw_reported: c.sw, q14_gcm_derived: null,
    shaft_nominal_mass_g: c.shaft_mass_g, source: c.source, in_use: false, catalog: true,
  }));
  const loft = (c) => (Number.isFinite(c.loft_deg) ? c.loft_deg : Infinity);
  const rows = mine.concat(cands).map((c, i) => [c, i]).sort((a, b) => loft(a[0]) - loft(b[0]) || a[1] - b[1]).map(([c]) => c);
  for (const c of rows) if (typeof IN_USE[c.club] === "boolean") c.in_use = IN_USE[c.club];
  return rows;
}

function renderSpecs(data) {
  const cols = [["in_use", "使用中", ""], ["club", "番手", "", (v) => clubLabel(v)], ["model_shaft", "モデル/シャフト", "記"],
    ["loft_deg", "ロフト°", "記", (v) => fmt(v, 1), true], ["length_in", "長さ in", "記", (v) => fmt(v, 2), true],
    ["lie_deg", "ライ°", "記", (v) => fmt(v, 1), true], ["total_mass_g", "重さ g", "測", (v) => fmt(v, 0), true],
    ["balance_from_butt_cm", "バランス点 cm", "測", (v) => fmt(v, 1), true], ["sw_reported", "SW", "記"],
    ["q14_gcm_derived", "Q14 g·cm", "算", (v) => fmt(v, 0), true],
    ["shaft_nominal_mass_g", "シャフト g", "記", (v) => fmt(v, 1), true]];
  const table = el("table", "specs");
  const head = el("tr");
  for (const [, name, kind, , num] of cols) {
    const th = el("th", num ? "num" : "", name);
    if (kind) {
      const k = el("span", "kind", kind);
      k.title = KIND_JA[kind] || kind;
      th.appendChild(k);
    }
    if (name === "使用中") th.title = "使用中のチェックはクリックで切り替えられる (このブラウザだけに覚える・データは変えない)";
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const c of specRows(data)) {
    const tr = el("tr", c.in_use ? "" : "cand");
    for (const [key, , , f, num] of cols) {
      let td;
      if (key === "in_use") {
        td = el("td", "check-cell");
        const box = el("input");
        box.type = "checkbox";
        box.checked = c.in_use;
        box.setAttribute("aria-label", clubLabel(c.club) + " を使用中にする");
        box.addEventListener("change", () => {
          IN_USE[c.club] = box.checked;
          saveInUse();
          tr.className = box.checked ? "" : "cand";
        });
        td.appendChild(box);
      } else if (key === "model_shaft") {
        td = el("td", "two-line");
        td.appendChild(el("span", "main", c.model || "—"));
        td.appendChild(el("span", "sub", (c.shaft || "—") + (c.flex_reported ? " · " + c.flex_reported : "")));
      } else {
        td = el("td", num ? "num" : "", f ? f(c[key]) : (c[key] || "—"));
      }
      if (key === "club" && c.source) td.title = "出所: " + c.source;
      if (c.catalog && num && key !== "balance_from_butt_cm" && key !== "q14_gcm_derived") td.title = "メーカーの仕様表の値 (パパの測定ではない)";
      if (key === "shaft_nominal_mass_g" && c.shaft_mass_status) {
        td.title = "シャフト重量: " + (SHAFT_STATUS_JA[c.shaft_mass_status] || c.shaft_mass_status);
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  const note = el("div", "legend");
  note.appendChild(el("span", "", "記 = 表の記載値 · 測 = パパの測定値 · 算 = 計算 (Q14 = 重さ × (バランス点 − 35.56cm)・SW の元になる量) · 番手にマウスを乗せると出所"));
  note.appendChild(el("span", "", "使用中のチェックはクリックで切り替えられる (このブラウザだけに覚える・データは変えない)。" +
    "使っていないクラブは薄い字。調べた候補 (data/candidate_clubs.csv) の数字はメーカーの仕様表の値で、パパの測定ではない (バランス点と Q14 は —)"));

  for (const code of new Set(data.clubs.map((c) => c.measurement_status).filter(Boolean))) {
    note.appendChild(el("span", "", (MEASUREMENT_STATUS_JA[code] || "測った/記載: " + code)));
  }
  document.getElementById("specs").appendChild(table);
  document.getElementById("specs-info").appendChild(note);
}

function clearNode(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
}

function drawCharts(data) {
  const carry = document.getElementById("carry");
  clearNode(carry);
  carry.appendChild(dotPlot(data, { field: "carry", extraField: "total", unit: "yd", step: 25, zero: false, digits: 1,
    meanLabel: "C", extraMeanLabel: "T",
    width: carry.clientWidth }));
  const metrics = document.getElementById("metrics");
  clearNode(metrics);
  for (const [field, title, unit, step, digits] of [["club_speed", "ヘッドスピード", "m/s", 2, 1], ["ball_speed", "ボールスピード", "m/s", 5, 1],
    ["launch", "打出角", "°", 4, 1], ["spin", "バックスピン", "rpm", 1000, 0],
    ["apex", "最高点", "yd", 5, 1]]) {
    const wrap = el("div");
    wrap.appendChild(el("h3", "", title));
    metrics.appendChild(wrap);
    wrap.appendChild(dotPlot(data, { field, unit, step, digits, rowH: 24, width: metrics.clientWidth }));
  }
  drawSim(data);
  drawFlows(data);
}

const FLOWS = [
  { title: "重量 × 長さ", full: "重量フロー (長さ × 総重量)", x: "length_in", xUnit: "in", y: "total_mass_g", yUnit: "g", digits: 0 },
  { title: "Q14", full: "Q14 フロー (スイングウェイトの元になる量)", x: "order", y: "q14_gcm_derived", yUnit: "g·cm", digits: 0, tag: "sw_reported" },
  { title: "バランス点 × 長さ", full: "バランス点フロー (長さ × グリップ端からのバランス点)", x: "length_in", xUnit: "in", y: "balance_from_butt_cm", yUnit: "cm", digits: 1 },
  { title: "m·B² (近似)", full: "慣性の近似 m·B² のフロー (近似: クラブ自身の重心まわりの慣性を含まない・本当の MOI ではない)", x: "order", y: "mb2_kgcm2_proxy", yUnit: "kg·cm²", digits: 0 },
  { title: "シャフト重量 (公称)", full: "シャフト重量フロー (公称)", x: "order", y: "shaft_nominal_mass_g", yUnit: "g", digits: 1 },
  { title: "長さとライ角", x: "length_in", xUnit: "in", y: "lie_deg", yUnit: "°", digits: 1 },
];

function niceStep(span, target) {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
}

function linearFit(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { a: my - b * mx, b };
}

function flowChart(data, f, width) {
  const W = Math.max(320, Math.round(width || 640)), H = 190, left = 56, right = 16, top = 20, bottom = 26;
  const clubs = data.clubs.filter((c) => Number.isFinite(c[f.y]) && (f.x === "order" || Number.isFinite(c[f.x])));
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  if (clubs.length < 2) {
    root.appendChild(svg("text", { x: left, y: H / 2, class: "dim" }, "データが足りないの"));
    return root;
  }
  const order = data.clubs.map((c) => c.club).reverse();
  const xv = (c) => (f.x === "order" ? order.indexOf(c.club) : c[f.x]);
  const ys = clubs.map((c) => c[f.y]), xs = clubs.map(xv);
  const xLo = f.x === "order" ? -0.5 : Math.min(...xs) - 0.5, xHi = f.x === "order" ? order.length - 0.5 : Math.max(...xs) + 0.5;
  const ySpan = Math.max(...ys) - Math.min(...ys) || 1, xSpan = xHi - xLo;
  const spanOk = (s) => Number.isFinite(s) && s > 0;
  const advances = (lo, hi, step) => lo + step > lo && hi + step > hi;
  const tooWide = (root) => {
    root.appendChild(svg("text", { x: left, y: H / 2, class: "dim" }, "値の幅が大きすぎて描けないの"));
    return root;
  };
  if (!spanOk(ySpan) || !spanOk(xSpan)) return tooWide(root);
  const yStep = niceStep(ySpan, 4);
  const yLo = Math.floor(Math.min(...ys) / yStep) * yStep, yTop = Math.ceil(Math.max(...ys) / yStep) * yStep;
  const yHi = yTop > yLo ? yTop : yLo + yStep;
  const xStep = f.x === "order" ? 1 : niceStep(xSpan, 6);
  if (!spanOk(yHi - yLo) || !advances(yLo, yHi, yStep) || !advances(xLo, xHi, xStep)) return tooWide(root);
  const X = (v) => left + ((v - xLo) / (xHi - xLo)) * (W - left - right);
  const Y = (v) => top + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - top - bottom);
  const grid = svg("g", { class: "grid" }), axis = svg("g", { class: "axis" });
  for (let v = yLo; v <= yHi + 1e-9; v += yStep) {
    grid.appendChild(svg("line", { x1: left, x2: W - right, y1: Y(v), y2: Y(v) }));
    axis.appendChild(svg("text", { x: left - 6, y: Y(v) + 3, "text-anchor": "end" }, (Math.round(v * 10) / 10).toString()));
  }
  axis.appendChild(svg("text", { x: left - 6, y: 10, "text-anchor": "end" }, f.yUnit));
  if (f.x === "order") {
    order.forEach((name, i) => axis.appendChild(svg("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, clubLabel(name))));
  } else {
    for (let v = Math.ceil(xLo / xStep) * xStep; v <= xHi + 1e-9; v += xStep) {
      grid.appendChild(svg("line", { x1: X(v), x2: X(v), y1: top, y2: H - bottom }));
      axis.appendChild(svg("text", { x: X(v), y: H - 8, "text-anchor": "middle" }, (Math.round(v * 100) / 100).toString()));
    }
    axis.appendChild(svg("text", { x: W - right, y: H - 8, "text-anchor": "end" }, f.xUnit));
  }
  root.appendChild(grid);
  if (f.x !== "order") {
    const fit = linearFit(clubs.map((c) => [xv(c), c[f.y]]));
    if (fit) {
      const fitLine = svg("line", { x1: X(xLo), y1: Y(fit.a + fit.b * xLo), x2: X(xHi), y2: Y(fit.a + fit.b * xHi),
        stroke: css("--fg-muted"), "stroke-width": 1, "stroke-dasharray": "4 4" });
      const fitTitle = svg("title");
      fitTitle.textContent = "点線 = 直線の当てはめ (目安)";
      fitLine.appendChild(fitTitle);
      root.appendChild(fitLine);
    }
  }
  const sorted = clubs.slice().sort((a, b) => order.indexOf(a.club) - order.indexOf(b.club));
  root.appendChild(svg("polyline", { points: sorted.map((c) => `${X(xv(c)).toFixed(1)},${Y(c[f.y]).toFixed(1)}`).join(" "),
    fill: "none", stroke: css("--accent"), "stroke-width": 1.5, "stroke-opacity": 0.6 }));
  for (const c of sorted) {
    const cx = X(xv(c)), cy = Y(c[f.y]);
    const dot = svg("circle", { cx, cy, r: 4, fill: css("--accent") });
    const t = svg("title");
    t.textContent = `${clubLabel(c.club)} · ${fmt(c[f.y], f.digits)} ${f.yUnit}` + (f.x !== "order" ? ` · ${fmt(c[f.x], 2)} ${f.xUnit}` : "") +
      (f.tag && c[f.tag] ? ` · ${c[f.tag]}` : "");
    dot.appendChild(t);
    root.appendChild(dot);
    const label = f.tag && c[f.tag] ? `${clubLabel(c.club)} ${c[f.tag]}` : clubLabel(c.club);
    root.appendChild(svg("text", { x: cx, y: cy - 8, "text-anchor": "middle", class: "dim" }, label));
  }
  root.appendChild(axis);
  return root;
}

const SIM = {
  club: "7I",
  open: false,
  change: "none",
  mode: "head", dm: 10, r: 18,
  cand: null,
  candFromBase: true,
  swing: "none", x: 10,
  tour: true,
};
const SIM_MODES = [["head", "ヘッドに付ける"], ["shaft", "シャフト・グリップに付ける"]];
const SIM_SPEC = [["loft_deg", "sim-loft"], ["length_in", "sim-length"], ["total_mass_g", "sim-mass"], ["sw", "sim-sw"], ["shaft_mass_g", "sim-shaft"]];
const TOUR_JA = { pga: "PGA", lpga: "LPGA" };
let simReady = false;
let partsReady = false;
let PLAN = null;
let ARM = null;
const parsePts = (s) => String(s || "").split(" ").filter(Boolean).map((p) => p.split(",").map(Number));
const simCfg = (data) => ((data.trajectories || {}).model || {}).config;
const hasShots = (data, club) => data.shots.some((s) => s.club === club);
const whyJa = (s) => String(s || "").replace(/\b(\d+)deg\b/g, "$1°");

function signed(v, d) {
  if (!Number.isFinite(v)) return "—";
  const s = Math.abs(v).toFixed(d);
  if (Number(s) === 0) return s;
  return (v > 0 ? "+" : "−") + s;
}
const parseNum = (s) => (String(s).trim() === "" ? NaN : Number(s));
const ratioPct = (ratio) => (ratio - 1) * 100;
const rangeText = (a, b, d, unit) => {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return signed(lo, d) === signed(hi, d) ? signed(lo, d) + unit : `${signed(lo, d)} 〜 ${signed(hi, d)}${unit}`;
};
const intText = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("ja-JP") : "—");
const gText = (v) => fmt(v, Number.isInteger(v) ? 0 : 1);
const meanOf = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length;
const stepDigits = (step) => [0, 1, 2, 3].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-9) ?? 3;
const CONFIDENCE_JA = { low: "低い", mid: "中くらい", high: "高い" };
const SIM_NEAR = { loft: 2, length: 0.25 }, SIM_FAR = { loft: 6, length: 2 };

function renderArmNote(data) {
  ARM = typeof GolfPhysics === "undefined" ? null : GolfPhysics.armFromBody(data.profile);
  const text = !ARM ? "" : ARM.source === "height"
    ? `腕の長さ R = ${fmt(ARM.R_m, 3)} m (両肩の真ん中 → 手首・身長 ${fmt(ARM.H, 0)} cm × Drillis & Contini 1966 の比 (Winter 図 4.1)・丸めない ${fmt(ARM.R_m, 6)} m で計算)。` +
      "この箱の計算は身長からの R に固定 (説明のページのつまみとは別)。"
    : `腕の長さ R = ${fmt(ARM.R_m, 3)} m (Lampsa 1975 の値 — data.json に身長が無いので借りた・パパの腕ではない)。`;
  document.getElementById("sim-arm").textContent = text;
}

function simSelfCheck(data) {
  const loaded = typeof GolfPhysics !== "undefined";
  const traj = loaded ? GolfPhysics.selfCheck(data) : { ok: false, checked: 0, failures: ["physics.js が読めない"] };
  const parts = loaded && typeof GolfPhysics.partsSelfCheck === "function" ? GolfPhysics.partsSelfCheck(data)
    : { ok: false, checked: 0, failures: ["physics.js が読めない"] };
  simReady = traj.ok;
  partsReady = traj.ok && parts.ok;
  const shown = (res) => res.failures.slice(0, 3).join(" / ") + (res.failures.length > 3 ? ` ほか ${res.failures.length - 3} 件` : "");
  const fix = typeof GolfLabGate !== "undefined" ? "" : "python swe3_detailed_design/src/export_view.py を回したか確かめてね ";
  const alarm = [];
  if (!traj.ok) {
    alarm.push("計算がずれてる: 画面の物理 (physics.js) と Python の軌跡が合わないから、ボールの軌跡とシミュレーションの「変える」を止めてるの。" +
      fix + "(" + shown(traj) + ")");
  }
  if (!parts.ok) {
    alarm.push("計算がずれてる: 画面の部品モデル (physics.js) と data.json の clubs[].parts (Python) が合わないから、「変える」の「替える」を止めてるの。" +
      fix + "(" + shown(parts) + ")");
  }
  document.getElementById("alarm").textContent = alarm.join(" ／ ");
  const checkFull = "自己点検: " +
    (traj.ok ? `軌跡 ${traj.checked} 球 OK` : "軌跡がずれた — 「変える」を止めてる") + " · " +
    (parts.ok ? `部品モデル ${parts.checked} 本 OK` : "部品モデルがずれた — 「替える」を止めてる") + (traj.ok && parts.ok ? " (JS = Python)" : "");
  const checkEl = document.getElementById("sim-check");
  checkEl.textContent = traj.ok && parts.ok ? "✓ 点検" : checkFull;
  checkEl.title = checkFull;
}

function renderSimClubs(data) {
  const box = document.getElementById("traj-clubs");
  clearNode(box);
  if (!data.order.includes(SIM.club)) SIM.club = data.order[0] || null;
  for (const c of data.order) {
    const b = el("button", "", clubLabel(c));
    b.type = "button";
    b.setAttribute("aria-pressed", String(c === SIM.club));
    b.addEventListener("click", () => simSetClub(data, c));
    box.appendChild(b);
  }
}

function simSetClub(data, club) {
  SIM.club = club;
  if (SIM.open) {
    SIM.tour = !hasShots(data, club);
    document.getElementById("sim-tour").checked = SIM.tour;
  }
  if (SIM.change === "swap" && SIM.candFromBase) simCandFromBase(data);
  renderSimClubs(data);
  updateSim(data);
}

function simCandFromBase(data) {
  const c = data.clubs.find((x) => x.club === SIM.club) || {};
  const num = (v) => (Number.isFinite(v) ? v : NaN);
  SIM.cand = { id: null, loft_deg: num(c.loft_deg), length_in: num(c.length_in), total_mass_g: num(c.total_mass_g),
    sw: String(c.sw_reported ?? ""), shaft_mass_g: num(c.shaft_nominal_mass_g) };
  SIM.candFromBase = true;
  simFillSpec();
}

function simFillSpec() {
  for (const [key, id] of SIM_SPEC) {
    const v = SIM.cand ? SIM.cand[key] : "";
    document.getElementById(id).value = typeof v === "number" && !Number.isFinite(v) ? "" : String(v ?? "");
  }
}

function simPickCand(data, c) {
  SIM.cand = { id: c.id };
  for (const [key] of SIM_SPEC) SIM.cand[key] = key === "sw" ? String(c[key] ?? "") : c[key];
  SIM.candFromBase = false;
  simFillSpec();
  if (c.ref_club && data.order.includes(c.ref_club)) SIM.club = c.ref_club;
  renderSimClubs(data);
  updateSim(data);
}

function simState() {
  const open = SIM.open && simReady;
  const change = !open || SIM.change === "none" ? { kind: "none" }
    : SIM.change === "weight" ? { kind: "weight", mode: SIM.mode, dm: SIM.dm, r: SIM.r }
    : { kind: "swap", cand: Object.assign({}, SIM.cand) };
  const swing = !open || SIM.swing === "none" ? { kind: "none" }
    : SIM.swing === "pct" ? { kind: "pct", x: SIM.x } : { kind: SIM.swing };
  return { club: SIM.club, change, swing, includeHsFlag: true };
}

const simAppBlock = () => (SIM.open && SIM.change === "swap" && !partsReady
  ? "部品モデルの自己点検でずれたから、「替える」を止めてるの (上の赤い帯)" : "");
const simAfter = () => (PLAN && PLAN.ok && PLAN.changed && !PLAN.blocked && !PLAN.percent_only && !simAppBlock() ? PLAN : null);

function updateSim(data) {
  PLAN = SIM.open && simReady && typeof GolfPhysics !== "undefined" ? GolfPhysics.simPlan(maskedData(data), simState()) : null;
  renderSimControls(data);
  drawSim(data);
}

function simRadios(name, value, why) {
  for (const r of document.querySelectorAll(`input[name="${name}"]`)) {
    r.checked = r.value === value;
    r.disabled = Boolean(why[r.value]);
    if (r.parentNode) r.parentNode.title = why[r.value] ? whyJa(why[r.value]) : "";
  }
}

function simWhyLine(why, names) {
  const groups = new Map();
  for (const [key, name] of Object.entries(names)) {
    if (!why[key]) continue;
    const k = whyJa(why[key]);
    groups.set(k, (groups.get(k) || []).concat(name));
  }
  return groups.size ? "押せない: " + [...groups].map(([k, ns]) => `${ns.join("・")} — ${k}`).join(" / ") : "";
}

function renderSimControls(data) {
  const stop = document.getElementById("sim-stop");
  const parts = ["sim-change-row", "sim-why-change", "sim-weight", "sim-swap", "sim-swing-row", "sim-why-swing"];
  if (!simReady) {
    stop.hidden = false;
    stop.textContent = "自己点検で計算がずれたから、「変える」を止めてるの (上の赤い帯)。今の軌跡は data.json (Python) の値のまま出してる";
    for (const id of parts) document.getElementById(id).hidden = true;
    return;
  }
  stop.hidden = true;
  const plan = PLAN && PLAN.ok ? PLAN : null;
  const dis = (plan && plan.disabled) || {};
  const rec = hasShots(data, SIM.club);
  const changeWhy = { none: null, weight: dis.weight || null,
    swap: !partsReady ? "部品モデルの自己点検でずれた" : !rec ? dis.swap || null : null };
  const swingWhy = { none: null, pct: dis.pct || null, pga: dis.pga || null, lpga: dis.lpga || null };
  simRadios("sim-change", SIM.change, changeWhy);
  simRadios("sim-swing", SIM.swing, swingWhy);
  document.getElementById("sim-change-row").hidden = false;
  document.getElementById("sim-swing-row").hidden = false;
  document.getElementById("sim-why-change").hidden = false;
  document.getElementById("sim-why-swing").hidden = false;
  document.getElementById("sim-why-change").textContent = simWhyLine(changeWhy, { weight: "重さを足す", swap: "替える" });
  document.getElementById("sim-why-swing").textContent = simWhyLine(swingWhy, { pct: "x% 速く", pga: "PGA にそろえる", lpga: "LPGA にそろえる" });
  document.getElementById("sim-x").disabled = Boolean(swingWhy.pct);
  const weight = document.getElementById("sim-weight");
  weight.hidden = SIM.change !== "weight";
  if (!weight.hidden) renderSimWeight(data);
  const swap = document.getElementById("sim-swap");
  swap.hidden = SIM.change !== "swap";
  if (!swap.hidden) renderSimSwap(data, plan);
}

function renderSimWeight(data) {
  const modeBox = document.getElementById("sim-mode");
  clearNode(modeBox);
  for (const [key, name] of SIM_MODES) {
    const b = el("button", "", name);
    b.type = "button";
    b.setAttribute("aria-pressed", String(key === SIM.mode));
    b.addEventListener("click", () => { SIM.mode = key; updateSim(data); });
    modeBox.appendChild(b);
  }
  document.getElementById("sim-r-wrap").hidden = SIM.mode !== "shaft";
  const part = ((data.clubs.find((x) => x.club === SIM.club) || {}).parts || [])[0];
  document.getElementById("sim-r-hint").textContent = part
    ? `グリップ端から重さの重心まで (0〜${fmt(part.length_cm, 1)} cm・グリップは 0〜約 26 cm)` : "グリップ端から重さの重心まで";
}

function simCloseness(base, cand) {
  const dLoft = cand.loft_deg - base.loft_deg, dLen = cand.length_in - base.length_in;
  if (!Number.isFinite(dLoft) || !Number.isFinite(dLen)) return null;
  const a = Math.abs(dLoft), b = Math.abs(dLen);
  const level = a <= SIM_NEAR.loft && b <= SIM_NEAR.length ? "近い"
    : a > SIM_FAR.loft || b > SIM_FAR.length ? "遠い" : "やや遠い";
  return { level, text: `ロフト ${signed(dLoft, 1)}°・長さ ${signed(dLen, 2)} in` };
}

function renderSimSwap(data, plan) {
  const cands = (data.swap || {}).candidates || [];
  const kind = plan && plan.cand;
  const match = kind && kind.kind === "catalog" ? cands.find((c) => c.id === kind.id) || null : null;
  const box = document.getElementById("sim-cands");
  clearNode(box);
  box.appendChild(el("span", "seg-title", "候補"));
  for (const c of cands) {
    const b = el("button", "", clubLabel(c.id));
    b.type = "button";
    b.title = `${c.name} (カタログの参考値・押すと番手が土台の ${clubLabel(c.ref_club)} に切り替わる)`;
    b.setAttribute("aria-pressed", String(match === c));
    b.addEventListener("click", () => simPickCand(data, c));
    box.appendChild(b);
  }
  if (!match) box.appendChild(el("span", "muted", SIM.candFromBase
    ? `手入力 (欄 = 土台 ${clubLabel(SIM.club)} の仕様のまま・候補は選んでいない)` : "手入力 (カタログの値から書き換えた)"));
  const noBase = plan && plan.disabled.swap;
  const why = !partsReady ? "部品モデルの自己点検でずれたから、「替える」を止めてるの (上の赤い帯)"
    : noBase ? `${whyJa(noBase)} — ${clubLabel(SIM.club)} を土台にはできないから「今」の線だけ出してる。候補を押すと、その候補の土台の番手に切り替わる` : "";
  document.getElementById("sim-spec").hidden = Boolean(why);
  document.getElementById("sim-why-swap").textContent = why;
  const labels = document.getElementById("sim-labels");
  clearNode(labels);
  if (why || !SIM.cand) return;
  const base = data.clubs.find((c) => c.club === SIM.club);
  const near = base ? simCloseness(base, SIM.cand) : null;
  const t1 = el("span", "sim-tag");
  t1.appendChild(el("span", "", "土台との条件の近さ: "));
  t1.appendChild(el("strong", "", near ? near.level : "—"));
  if (near) t1.appendChild(el("span", "muted", ` (${clubLabel(SIM.club)} と比べて ${near.text} · 当てはまりの保証ではない)`));
  t1.title = "近い = ロフト ±2°・長さ ±0.25 in の内 / 遠い = ロフトの差 6° 超か長さの差 2 in 超 / その間 = やや遠い (クラブの種類は見ていない)";
  labels.appendChild(t1);
  const t2 = el("span", "sim-tag");
  t2.appendChild(el("span", "", "カタログの値の確かさ: "));
  if (match) {
    t2.appendChild(el("strong", "", CONFIDENCE_JA[match.confidence] || match.confidence || "—"));
    t2.appendChild(el("span", "muted", ` (${match.confidence} · ${match.name} · カタログの参考値・パパの実測とはずれることがある) `));
    if ((match.source || "").startsWith("https://")) {
      const a = el("a", "", "出所");
      a.setAttribute("href", match.source);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      t2.appendChild(a);
    }
    if (match.note) t2.title = match.note;
  } else {
    t2.appendChild(el("strong", "", "手入力"));
    t2.appendChild(el("span", "muted", " (カタログの値ではない・欄の値で計算)"));
  }
  labels.appendChild(t2);
}

function bindSim(data) {
  const details = document.getElementById("sim-change");
  const tour = document.getElementById("sim-tour");
  details.addEventListener("toggle", () => {
    SIM.open = details.open;
    if (SIM.open && hasShots(data, SIM.club)) SIM.tour = false;
    if (!SIM.open) SIM.tour = true;
    tour.checked = SIM.tour;
    updateSim(data);
  });
  tour.checked = SIM.tour;
  tour.addEventListener("change", () => { SIM.tour = tour.checked; drawSim(data); });
  for (const r of document.querySelectorAll('input[name="sim-change"]')) {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      SIM.change = r.value;
      if (SIM.change === "swap" && (!SIM.cand || SIM.candFromBase)) simCandFromBase(data);
      updateSim(data);
    });
  }
  for (const r of document.querySelectorAll('input[name="sim-swing"]')) {
    r.addEventListener("change", () => { if (r.checked) { SIM.swing = r.value; updateSim(data); } });
  }
  const x = document.getElementById("sim-x");
  x.value = String(SIM.x);
  x.addEventListener("input", () => { SIM.x = parseNum(x.value); SIM.swing = "pct"; updateSim(data); });
  const dm = document.getElementById("sim-dm"), r = document.getElementById("sim-r");
  dm.value = String(SIM.dm);
  r.value = String(SIM.r);
  dm.addEventListener("input", () => { SIM.dm = parseNum(dm.value); updateSim(data); });
  r.addEventListener("input", () => { SIM.r = parseNum(r.value); updateSim(data); });
  for (const [key, id] of SIM_SPEC) {
    const input = document.getElementById(id);
    input.addEventListener("input", () => {
      SIM.cand = SIM.cand || { id: null };
      SIM.cand[key] = key === "sw" ? input.value : parseNum(input.value);
      SIM.candFromBase = false;
      updateSim(data);
    });
  }
}

function drawSim(data) {
  const after = simAfter();
  drawTrajectory(data, after);
  drawTrajExcluded(data);
  drawSimOut(data);
  renderSimNotes();
  document.getElementById("lg-after").hidden = !after;
  document.getElementById("lg-after-sw").style.background = css("--after");
}

function renderSimNotes() {
  const p = simAfter() || (PLAN && PLAN.ok && PLAN.percent_only && !simAppBlock() ? PLAN : null);
  const ul = document.getElementById("sim-notes");
  ul.hidden = !p;
  if (!p) return;
  const align = p.swing === "pga" || p.swing === "lpga";
  const on = { changed: true, weight: p.change === "weight", swap: p.change === "swap", swing: p.swing !== "none", align,
    hs: (p.change === "weight" || p.change === "swap") && !align, band: p.band, noband: !p.band };
  for (const li of ul.querySelectorAll("li[data-sim]")) li.hidden = !on[li.getAttribute("data-sim")];
}

function trajLines(data, plan) {
  const T = data.trajectories || { shots: [], tour: [] };
  const shotById = Object.fromEntries(data.shots.map((s) => [s.shot_id, s]));
  const adopted = plan ? plan.shots.filter((r) => r.adopted) : [];
  const adoptedIds = new Set(adopted.map((r) => r.shot_id));
  const lines = [];
  for (const t of SIM.tour ? T.tour.filter((t) => t.club === SIM.club) : []) {
    const m = (data.tour || []).find((x) => x.tour === t.tour && x.club === t.club) || {};
    const lp = /^LPGA/i.test(t.tour);
    lines.push({ kind: lp ? "lpga" : "pga", name: (lp ? "LPGA" : "PGA") + " 平均", model: t, pts: parsePts(t.points_yd), inp: m, meas: m,
      measBy: "TrackMan", color: css(lp ? "--lpga" : "--pga"), width: 3, ray: m.launch });
  }
  for (const t of T.shots.filter((t) => t.club === SIM.club)) {
    const s = shotById[t.shot_id] || {};
    lines.push({ kind: "mine", name: "パパ " + t.shot_id, model: t, pts: parsePts(t.points_yd), inp: s, meas: s, measBy: "X-SWING の画面",
      color: css(flagged(s) ? "--attention-em" : "--accent"), width: 2, dash: flagged(s) ? "6 4" : null,
      flag: flagged(s) ? s.review_flag : "", ray: adoptedIds.has(t.shot_id) ? null : s.launch });
  }
  const cfg = simCfg(data);
  for (const r of adopted) {
    const after = r.after;
    const tr = GolfPhysics.trajectory(after.ball_speed, after.launch, after.spin, cfg, 25);
    if (!tr.ok) continue;
    lines.push({ kind: "after", name: "変えた後 " + r.shot_id, model: { carry: tr.carry_yd, apex: tr.apex_yd, land_angle: tr.landing_angle_deg_down },
      pts: tr.points_yd, inp: after, meas: {}, measBy: "", color: css("--after"), width: 2, dash: r.flagged ? "6 4" : null,
      flag: r.flagged ? r.review_flag : "", ray: after.launch });
  }
  return lines;
}

function drawTrajectory(data, plan) {
  const box = document.getElementById("traj"), table = document.getElementById("traj-table");
  clearNode(box);
  clearNode(table);
  const lines = SIM.club ? trajLines(data, plan) : [];
  const T = data.trajectories || { shots: [], tour: [] };
  const nOut = (T.shots || []).some((t) => t.club === SIM.club) ? 0
    : (T.excluded || []).filter((x) => x.kind === "shot" && x.club === SIM.club).length;
  if (lines.length === 0) {
    const hasTour = T.tour.some((t) => t.club === SIM.club);
    const allOut = `${clubLabel(SIM.club)} の ${nOut} 球は全部、軌跡を描いていない (下の一覧)`;
    box.appendChild(el("div", "empty", nOut > 0
      ? allOut + (hasTour ? "。ツアーの線は上のチェックで出せるよ" : "")
      : hasTour
        ? `${clubLabel(SIM.club)} はパパの記録が無いの。ツアーの線は上のチェックで出せるよ`
        : `${clubLabel(SIM.club)} は記録もツアーの平均も無いから、軌跡は描けないの (重さを足す時は % だけ出すね)`));
    return;
  }
  const fin = (v) => Number.isFinite(v);
  const xMaxRaw = Math.max(...lines.flatMap((l) => [l.model.carry, l.meas.carry]).filter(fin));
  const yMaxRaw = Math.max(...lines.flatMap((l) => [l.model.apex, l.meas.apex]).filter(fin));
  const xs = niceStep(xMaxRaw, 8), ys = niceStep(yMaxRaw, 5);
  const xMax = Math.ceil(xMaxRaw / xs) * xs, yMax = Math.ceil((yMaxRaw * 1.08) / ys) * ys;
  const W = Math.max(320, Math.round(box.clientWidth || 640)), H = 340;
  const left = 36, right = 56, top = 14, bottom = 26;
  const pw = W - left - right, ph = H - top - bottom;
  const x = (v) => left + (v / xMax) * pw, y = (v) => top + ph - (v / yMax) * ph;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const grid = svg("g", { class: "grid" }), axis = svg("g", { class: "axis" });
  for (let v = 0; v <= xMax + 1e-9; v += xs) {
    grid.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: top + ph }));
    axis.appendChild(svg("text", { x: x(v), y: H - 8, "text-anchor": "middle" }, String(v)));
  }
  for (let v = 0; v <= yMax + 1e-9; v += ys) {
    grid.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(v), y2: y(v) }));
    axis.appendChild(svg("text", { x: left - 4, y: y(v) + 3, "text-anchor": "end" }, String(v)));
  }
  axis.appendChild(svg("text", { x: W - 2, y: H - 8, "text-anchor": "end" }, "飛距離 yd"));
  axis.appendChild(svg("text", { x: left + 6, y: top + 10 }, "高さ yd"));
  root.appendChild(grid);
  root.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(0), y2: y(0), stroke: css("--fg-muted"), "stroke-width": 1 }));
  const layer = { pga: 0, lpga: 0, mine: 1, after: 2 };
  for (const l of lines.slice().sort((a, b) => layer[a.kind] - layer[b.kind])) {
    const pts = l.pts;
    if (fin(l.ray) && l.ray > 0) {
      const tan = Math.tan((l.ray * Math.PI) / 180), xEnd = Math.min(xMax, yMax / tan);
      const ray = svg("line", { x1: x(0), y1: y(0), x2: x(xEnd), y2: y(xEnd * tan), stroke: l.color, "stroke-width": 1, "stroke-opacity": 0.55 });
      const rt = svg("title");
      rt.textContent = `${l.name} · 打ち出しの向き ${fmt(l.ray)}° のまっすぐな線`;
      ray.appendChild(rt);
      root.appendChild(ray);
    }
    const line = svg("polyline", { points: pts.map(([px, py]) => `${x(px).toFixed(1)},${y(py).toFixed(1)}`).join(" "),
      fill: "none", stroke: l.color, "stroke-width": l.width, "stroke-linejoin": "round", "stroke-opacity": l.kind === "mine" ? 0.85 : 1 });
    if (l.dash) line.setAttribute("stroke-dasharray", l.dash);
    const tt = svg("title");
    const inp = l.inp;
    tt.textContent = `${l.name} · 計算: キャリー ${fmt(l.model.carry)} yd · 最高点 ${fmt(l.model.apex)} yd · 落下角 ${fmt(l.model.land_angle)}°` +
      ` · 入力${l.kind === "after" ? " (計算)" : ""}: ボールスピード ${fmt(inp.ball_speed)} m/s · 打出角 ${fmt(inp.launch)}° · スピン ${fmt(inp.spin, 0)} rpm` +
      (l.flag ? ` · 確認が必要: ${l.flag}` : "");
    line.appendChild(tt);
    root.appendChild(line);
    if (l.kind === "after") continue;
    const peak = pts.reduce((a, p) => (p[1] > a[1] ? p : a), [0, 0]);
    const mark = (node, text) => { const t = svg("title"); t.textContent = text; node.appendChild(t); root.appendChild(node); };
    if (fin(l.meas.apex)) {
      mark(svg("line", { x1: x(peak[0]) - 9, x2: x(peak[0]) + 9, y1: y(l.meas.apex), y2: y(l.meas.apex), stroke: l.color, "stroke-width": 3 }),
        `${l.name} · ${l.measBy} の最高点 ${fmt(l.meas.apex)} yd (計算は ${fmt(l.model.apex)} yd)`);
    }
    if (fin(l.meas.carry)) {
      const cx = x(l.meas.carry), cy = y(0);
      const shape = l.kind === "lpga" ? svg("path", { d: `M${cx},${cy - 7} L${cx + 7},${cy + 5} L${cx - 7},${cy + 5} Z`, fill: l.color })
        : l.kind === "pga" ? svg("path", { d: `M${cx},${cy - 7} L${cx + 7},${cy} L${cx},${cy + 7} L${cx - 7},${cy} Z`, fill: l.color })
        : svg("circle", { cx, cy, r: 5, fill: css("--canvas"), stroke: l.color, "stroke-width": 2 });
      mark(shape, `${l.name} · ${l.measBy} のキャリー ${fmt(l.meas.carry)} yd (計算は ${fmt(l.model.carry)} yd)`);
    }
    if (l.kind !== "mine") root.appendChild(svg("text", { x: x(l.model.carry) + 8, y: y(0) - 8, fill: l.color, "font-weight": 600 }, l.name.split(" ")[0]));
  }
  root.appendChild(axis);
  box.appendChild(root);
  const k = (ph / yMax) / (pw / xMax);
  const tbl = el("table", "specs");
  const head = el("tr");
  for (const [h, num] of [["線", false], ["ボールスピード m/s", true], ["打出角 °", true], ["スピン rpm", true], ["キャリー yd", true], ["最高点 yd", true], ["落下角 °", true]]) head.appendChild(el("th", num ? "num" : "", h));
  tbl.appendChild(head);
  tbl.appendChild((() => {
    const r = el("tr");
    r.appendChild(el("td", "muted", ""));
    for (let i = 0; i < 3; i++) r.appendChild(el("td", "num muted", "入力"));
    for (let i = 0; i < 3; i++) r.appendChild(el("td", "num muted", "計算 / 測定"));
    return r;
  })());
  for (const l of lines) {
    const r = el("tr");
    const name = el("td");
    const sw = el("span", "swatch");
    sw.style.background = l.color;
    name.appendChild(sw);
    name.appendChild(el("span", "", l.name + (l.kind === "after" ? " (入力も計算)" : "") + (l.flag ? " (要確認)" : "")));
    r.appendChild(name);
    r.appendChild(el("td", "num", fmt(l.inp.ball_speed, 1)));
    r.appendChild(el("td", "num", fmt(l.inp.launch, 1)));
    r.appendChild(el("td", "num", fmt(l.inp.spin, 0)));
    for (const f of ["carry", "apex", "land_angle"]) r.appendChild(el("td", "num", `${fmt(l.model[f])} / ${fmt(l.meas[f])}`));
    tbl.appendChild(r);
  }
  if (!lines.some((l) => l.kind === "mine")) {
    const r = el("tr");
    r.appendChild(el("td", "muted", nOut > 0 ? "パパ — 全部 軌跡を描いていない (下の一覧)" : "パパ — この番手はまだ未測定"));
    for (let i = 0; i < 6; i++) r.appendChild(el("td", "num muted", "—"));
    tbl.appendChild(r);
  }
  table.appendChild(tbl);
  const m = (data.trajectories || {}).model || {};
  document.getElementById("traj-note").textContent =
    `線は打出条件 (ボールスピード・打出角・バックスピン) から計算した 2D の参考弾道 (swe3_detailed_design/src/ballistics.py・0.002 秒刻み)。` +
    `無風・空気密度 ${fmt(m.rho_kgm3, 3)} kg/m³ (海面・15℃)・打った所と同じ高さに落ちる・左右の曲がりは省いてる。` +
    `ツアーの線は平均の打出条件から計算したもので、実測した軌跡の平均ではないの。` +
    `TrackMan の測った値と比べると、計算は落下角がいつも 2〜8° 浅い (落ち方が寝ている) から、落下角や止まりやすさの判断には使わないでね。` +
    `測定の欄: ツアー = TrackMan 2023 の平均、パパ = X-SWING の画面の値 (落下角は画面に無い)。` +
    (plan ? "紫の線 = 変えた後 (同じ式を移した physics.js の計算・パパの球ごと)。答え合わせの表の「変えた後」の行は入力も計算で、測定は無い。" : "") +
    `縦は横の約 ${k.toFixed(1)} 倍に拡大して描いてるから、見た目の傾きは本当の角度ではないよ。` +
    `細いまっすぐな線は打ち出しの向き (横から見た打出角)。軌跡がこの線より上にあるのは、バックスピンの揚力が重力より強い間に上へ曲がったから (線とのずれは揚力・重力・空気の抵抗の合わせ技で、揚力だけの分ではない・縦の拡大で大きく見えている)。` +
    `プロの球が「浮き上がって見える」のは、後ろから見ると見上げる角度が先まで上がり続けるからでもある (PGA の Driver の計算だと、打った人の目 (高さ 1.6 m) から見上げる角度は 120 yd 先まで上がり続ける)。`;
}

function drawTrajExcluded(data) {
  const box = document.getElementById("traj-excluded");
  const tag = document.getElementById("traj-excluded-tag"), list = document.getElementById("traj-excluded-list");
  const all = (data.trajectories || {}).excluded || [];
  const items = all.filter((x) => x.club !== null && x.club === SIM.club).concat(all.filter((x) => x.club === null));
  clearNode(list);
  const head = items.length > 0 ? `軌跡を描いていない物 ${items.length} 件 (記録は消していない)` : "";
  tag.textContent = `描いていない ${items.length} 件 ⓘ`;
  tag.title = head;
  if (items.length) list.appendChild(el("div", "", head));
  for (const x of items) {
    list.appendChild(el("div", "", x.kind === "shot" ? `パパ ${x.id}: ${whyJa(x.reason)}`
      : `${x.id} ${whyJa(x.source_club)}: ${whyJa(x.reason)}`));
  }
  box.hidden = items.length === 0;
}

function simTile(box, key, value, subs) {
  const t = el("div", "sim-stat");
  t.appendChild(el("div", "k", key));
  for (const v of Array.isArray(value) ? value : [value]) t.appendChild(el("div", "v", v));
  for (const s of subs.filter(Boolean)) t.appendChild(el("div", "s", s));
  box.appendChild(t);
}

function simWhyCells(item, shot) {
  if (!item || !shot) return null;
  const SHOT3 = ["ball_speed", "launch", "spin"];
  const inputs = item.stage === "base" ? SHOT3
    : item.stage === "inverse" ? ["club_speed"].concat(SHOT3)
    : item.stage === "same" && item.reason === "記録の HS が正の数ではない" ? ["club_speed"]
    : [];
  const off = inputs.filter((f) => !isCellUsed(shot, f));
  return off.length ? "表で外した: " + off.map(cellLabel).join("・") : null;
}

function simExcludedList(box, excluded, title) {
  if (!excluded || !excluded.length) return;
  box.appendChild(el("h3", "sim-section", title || `外した球 ${excluded.length} 球 (平均から外した・記録は消していない)`));
  const ul = el("ul", "sim-excluded");
  const rows = new Map(((PLAN && PLAN.shots) || []).map((r) => [String(r.shot_id), r]));
  for (const x of excluded) {
    ul.appendChild(el("li", "", `${x.shot_id}: ${simWhyCells(x, rows.get(String(x.shot_id))) || whyJa(x.reason)}`));
  }
  box.appendChild(ul);
}

function simWeightNote(data, p) {
  const parts = (data.clubs.find((c) => c.club === p.club) || {}).parts || [], p0 = parts[0] || {}, w = p.weight || {};
  return w.mode === "head"
    ? `ヘッドに付けた扱い: 位置 = ヘッドの重心 ${fmt(p0.head_pos_cm, 1)} cm (長さ − 2.5 cm の仮定)・ヘッド ${parts.map((q) => gText(q.head_mass_g)).join(" / ")} → ` +
      `${parts.map((q) => gText(q.head_mass_g + w.dm)).join(" / ")} g で衝突の補正を掛ける (ボールスピード = 法線・スピン = 接線の比)`
    : `シャフト・グリップ側の扱い: 位置 ${fmt(w.r, 1)} cm・ボールスピードとスピンの比 = HS の比 (衝突への寄与は 0 とする簡略化)`;
}

function simWeightTiles(tiles, data, p) {
  const w = p.weight, parts = (data.clubs.find((c) => c.club === p.club) || {}).parts || [];
  const multi = parts.length > 1;
  const dI = (w.i_after / w.i_before - 1) * 100, dJ = (w.j_after / w.j_before - 1) * 100;
  simTile(tiles, "MOI 推定 (グリップ端 kg·cm² / 肩まわり kg·m²)",
    [`${intText(w.i_before)} → ${intText(w.i_after)}`, `${fmt(w.j_before, 3)} → ${fmt(w.j_after, 3)}`],
    [`グリップ端 ${signed(dI, 1)}% · 肩まわり (腕 + クラブ) ${signed(dJ, 2)}%`, "部品モデルの推定 (本当の MOI ではない)・腕は Lampsa 1975 の仮定",
      multi ? `仮定: シャフト ${parts.map((q) => gText(q.shaft_mass_g)).join(" g と ")} g の 2 通り (公称が未確定)` : ""]);
  const dB = w.b_after_cm - w.b_before_cm, dQ = w.d_q14_gcm, dIabs = w.i_after - w.i_before;
  const qDir = Math.abs(dQ) < 0.5 ? "Q14 は変わらない" : `Q14 ${signed(dQ, 0)} g·cm — ` +
    (dQ > 0 ? "振った感じは重くなる向き (SW が上がる向き)" : "振った感じは軽くなる向き (SW が下がる向き)");
  simTile(tiles, "バランス点 (cm)", `${fmt(w.b_before_cm, 1)} → ${fmt(w.b_after_cm, 1)}`,
    [Math.abs(dB) < 0.05 ? "ほとんど動かない" : `${dB > 0 ? "ヘッド側" : "グリップ側"}へ ${fmt(Math.abs(dB), 1)} cm`, qDir,
      (dQ < -0.5 && dIabs > 0) ? "でも MOI 推定は上がる — SW が下がっても MOI は下がらない"
        : (dQ > 0.5 && dIabs < 0) ? "でも MOI 推定は下がる — SW と MOI は別の量" : "",
      `部品モデルの重心 ${parts.map((q) => fmt(q.b_pred_cm, 1)).join(" / ")} cm (測った値との差 ${parts.map((q) => signed(q.b_residual_cm, 1)).join(" / ")} cm)`]);
}

function drawSimOut(data) {
  const out = document.getElementById("sim-out");
  clearNode(out);
  if (!SIM.open || !simReady || !PLAN) return;
  const stop = (text) => out.appendChild(el("div", "sim-stop", text));
  if (!PLAN.ok) { stop("計算の範囲外: " + whyJa(PLAN.reason)); return; }
  const p = PLAN;
  if (!p.changed) {
    out.appendChild(el("p", "muted sim-summary", "クラブか振りを「そのまま」以外にすると、パパの球ごとに「変えた後」(紫の線) を重ねるよ"));
    return;
  }
  if (simAppBlock()) { stop(simAppBlock()); return; }
  if (p.blocked) {
    stop("「変えた後」は描いてない: " + whyJa(p.blocked) + (p.blocked_kind === "disabled" ? " (選んだものはそのまま残してる)" : ""));
    simExcludedList(out, p.excluded, "外した球と理由");
    return;
  }
  const cfg = simCfg(data);
  if (p.change === "weight") out.appendChild(el("p", "sim-mode-note", simWeightNote(data, p)));
  const align = p.swing === "pga" || p.swing === "lpga";
  const tiles = el("div", "sim-stats");
  if (p.percent_only) {
    const w = p.weight;
    simTile(tiles, "ヘッドスピード (中心 = グリップ端 / 肩まわり)", `${signed(ratioPct(w.hs_ratio), 2)}% / ${signed(ratioPct(w.hs_ratio_j), 2)}%`,
      [`幅 ${rangeText(ratioPct(w.hs_lo), ratioPct(w.hs_hi), 2, "%")} (グリップ端 / 肩まわりの MOI × n 0.19〜0.28 の試算の範囲)`, "n 0.25 の値・2 つの式が本当の値を挟む保証はない"]);
    simTile(tiles, "ボールスピード", signed(ratioPct(w.ball_ratio), 2) + "%",
      [`幅 ${rangeText(ratioPct(w.ball_lo), ratioPct(w.ball_hi), 2, "%")} · 肩まわりの MOI なら ${signed(ratioPct(w.ball_ratio_j), 2)}%`,
        w.mode === "head" ? "ヘッドに付けた扱い (衝突の補正あり)" : "シャフト・グリップ側の扱い (衝突の補正なし)"]);
    simWeightTiles(tiles, data, p);
    out.appendChild(tiles);
    out.appendChild(el("div", "empty", `${clubLabel(p.club)} は記録が無いから % だけ (記録が入ったら球ごとの軌跡とキャリーの差を出すね)`));
    return;
  }
  const m = p.mean, ad = p.shots.filter((r) => r.adopted);
  const how = p.change === "swap" ? "クラブを替える (逆算 → 前向き)" : "同じクラブ (掛け算)";
  const hsHow = align ? `HS = ${TOUR_JA[p.swing]} の ${p.target.tour_club} の平均 ${fmt(p.target.club_speed, 2)} m/s (球ごと・HS の式の比を掛けない・幅なし)`
    : p.k !== null ? `HS × ${fmt(p.k, 2)} (x% 速く)` : "";
  out.appendChild(el("p", "sim-summary",
    `使った球 ${p.n_adopted} 球 (${clubLabel(p.club)} の ${p.n_shots} 球のうち) · 外した球 ${p.n_excluded} 球 · ${how}` + (hsHow ? ` · ${hsHow}` : "") +
    " · 平均は使った球だけ (今も変えた後も同じ球)"));
  const sw = p.swap, hs = sw && sw.hs, w = p.weight;
  const flaggedN = ad.filter((r) => r.flagged).length;
  const hsN = ad.filter((r) => Number.isFinite(r.after.club_speed)).length;
  const launchSens = p.change !== "swap" ? [] : [1, 2].map((d) => {
    const ds = ad.map((r) => {
      const f = GolfPhysics.simulate(r.after.ball_speed, r.after.launch + d, r.after.spin, cfg);
      return f.ok ? f.carry_yd - r.before.carry : NaN;
    });
    return ds.every(Number.isFinite) ? `+${d}° で ${signed(meanOf(ds), 1)} yd` : null;
  }).filter(Boolean);
  const extra = {
    club_speed: [align ? `${p.target.tour} の平均 (TrackMan の外部の平均・パパの記録ではない)`
      : p.change === "weight" ? `重さの比: グリップ端 ${signed(ratioPct(w.hs_ratio), 2)}% / 肩まわり ${signed(ratioPct(w.hs_ratio_j), 2)}% (n 0.25)` + (p.k !== null ? ` × ${fmt(p.k, 2)}` : "")
      : p.change === "swap" ? `替えた比: グリップ端 ${signed(ratioPct(hs.ratio_i), 2)}% · 肩まわり ${signed(ratioPct(hs.ratio_j), 2)}% (n 0.25)` + (p.k !== null ? ` × ${fmt(p.k, 2)}` : "")
      : "",
      p.change === "swap" && !align ? "クラブの種類・長さの領域をまたぐ転用" + (hs.extrapolated ? ` · 長さの差 ${signed(hs.d_length_in, 2)} in は 2 in を超える外挿` : "") : "",
      hsN === ad.length ? "" : hsN ? `HS の平均は HS のある ${hsN} 球だけ (表で HS を外した球も、ほかの数には入れる)`
        : "HS のある球が無い (表で HS を外した・ほかの数は全部の球で出す)"],
    ball_speed: [p.change === "weight" && w.mode === "head" ? "衝突の補正あり (法線方向)" : ""],
    spin: [p.change === "swap" ? "逆算した当たり方から" : p.change === "weight" && w.mode === "head" ? "衝突の比で変える (接線方向)" : "HS の比で変える (同じ当たり方)"],
    launch: [p.change === "swap" ? (p.band && m.hi.launch - m.lo.launch < 0.05 ? "HS の幅では動かない (この式では打出角は HS に依らない)" : "")
      : "打出角はそのまま (近似・同じロフト)"],
    carry: [flaggedN ? `要確認 ${flaggedN} 球を含む` : "",
      launchSens.length ? `打出角しだい: 変えた後の打出角 ${launchSens.join(" · ")} (計算モデルの詳細のツアーの答え合わせでは打出角が低く出た)` : "",
      "画面のキャリーに足した値ではない"],
    apex: [],
  };
  for (const [key, title, d, unit, pct] of [["club_speed", "ヘッドスピード (m/s)", 1, " m/s", true], ["ball_speed", "ボールスピード (m/s)", 1, " m/s", true],
    ["spin", "スピン (rpm)", 0, " rpm", true], ["launch", "打出角 (°)", 1, "°", false], ["carry", "キャリー (yd・計算 − 計算)", 1, " yd", false],
    ["apex", "最高点 (yd・計算)", 1, " yd", false]]) {
    const show = (v) => (key === "spin" ? intText(v) : fmt(v, d));
    const head = m.delta[key] === null ? "—" : `${signed(m.delta[key], d)}${unit}` + (pct ? ` (${signed(ratioPct(m.after[key] / m.before[key]), 1)}%)` : "") +
      (p.band ? ` · 幅 ${rangeText(m.delta_lo[key], m.delta_hi[key], d, unit)}` : "");
    simTile(tiles, title, `${show(m.before[key])} → ${show(m.after[key])}`, [head].concat(extra[key]));
  }
  if (p.change === "weight") simWeightTiles(tiles, data, p);
  if (p.change === "swap") {
    const bp = sw.base_part, cp = sw.cand_part, bal = sw.balance, dP = bal.points_cand - bal.points_base;
    const club = data.clubs.find((c) => c.club === p.club) || {};
    simTile(tiles, "MOI 推定 (グリップ端 kg·cm² / 肩まわり kg·m²)",
      [`${intText(bp.i_est_kgcm2)} → ${intText(cp.i_est_kgcm2)}`, `${fmt(hs.j_base, 3)} → ${fmt(hs.j_cand, 3)}`],
      [`グリップ端 ${signed((cp.i_est_kgcm2 / bp.i_est_kgcm2 - 1) * 100, 1)}% · ヘッド ${gText(bp.head_mass_g)} → ${gText(cp.head_mass_g)} g`,
        "部品モデルの推定 (本当の MOI ではない)・腕は Lampsa 1975 の仮定"]);
    simTile(tiles, "バランス点 (SW から・cm)", `${fmt(club.balance_from_butt_cm, 1)} → ${fmt(bal.balance_cm, 1)}`,
      [`土台 ${clubLabel(p.club)} ${bal.sw_base} (測定) → 候補 ${bal.sw_cand} (SW の差 ${signed(dP, 1)} pt × ${fmt(GolfPhysics.SW_POINT_GCM, 0)} g·cm)`,
        "土台のずれを持ち越した推定 (記載と実測の差が候補にも共通するかは確かめていない)"]);
  }
  out.appendChild(tiles);
  const fig = el("div", "sim-fig");
  fig.appendChild(el("h3", "", "球ごとのキャリーの差 (変えた後 − 今・どちらも計算)"));
  fig.appendChild(simDeltaPlot(ad, out.clientWidth, p.club));
  const multi = (((data.clubs.find((c) => c.club === p.club) || {}).parts) || []).length > 1;
  const lg = el("div", "legend");
  lg.appendChild(el("span", "", "1 点 = 1 球 (" + (!p.band ? (align ? "幅なし — そろえる時は HS を直接決める" : "幅なし — x% は倍率 1 つ") : "グリップ端・n 0.25 · ひげ = 幅 (グリップ端 / 肩まわりの MOI × n 0.19〜0.28" +
    (multi ? " + シャフト 2 通り" : "") + ")") + ") · 縦線 = 平均 · 橙の縁 = 確認が要る球 (使った球は平均に含める)"));
  fig.appendChild(lg);
  out.appendChild(fig);
  simExcludedList(out, p.excluded);
  simShotTable(out, p);
  if (p.change === "swap") simSwapDetails(out, p);
}

function simDeltaPlot(rows, width, club) {
  const labelW = 44, meanW = 56, laneH = 22;
  const W = Math.max(320, Math.round(width || 640));
  const left = labelW + meanW + 8, right = 52, top = 18, bottom = 22;
  const rowH = Math.max(24, rows.length * laneH + 6);
  const H = top + rowH + bottom;
  const vals = rows.flatMap((r) => [r.carry_delta, r.carry_delta_lo, r.carry_delta_hi]).concat([0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  let ok = vals.every((v) => Number.isFinite(v)) && Number.isFinite(hi - lo), step = NaN;
  if (ok) {
    if (hi - lo < 1e-9) { lo = -0.5; hi = 0.5; }
    step = niceStep(hi - lo, 5);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    ok = Number.isFinite(hi - lo) && lo + step > lo && hi + step > hi;
  }
  if (!ok) {
    const stop = svg("svg", { viewBox: `0 0 ${W} 40`, role: "img" });
    stop.appendChild(svg("text", { x: 4, y: 24, class: "dim" }, "キャリーの差が数でないので図は描いていない"));
    return stop;
  }
  const x = (v) => left + ((v - lo) / (hi - lo)) * (W - left - right);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const grid = svg("g", { class: "grid" }), axis = svg("g", { class: "axis" });
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: top + rowH }));
    axis.appendChild(svg("text", { x: x(v), y: H - 6, "text-anchor": "middle" }, signed(v, stepDigits(step))));
  }
  axis.appendChild(svg("text", { x: W - 2, y: H - 6, "text-anchor": "end" }, "yd"));
  root.appendChild(grid);
  root.appendChild(svg("text", { x: 4, y: 12, class: "dim" }, "番手"));
  root.appendChild(svg("text", { x: labelW + meanW, y: 12, "text-anchor": "end", class: "dim" }, "平均 yd"));
  root.appendChild(svg("rect", { class: "row-bg", x: 0, y: top, width: W, height: rowH, opacity: 0.6 }));
  root.appendChild(svg("line", { x1: x(0), x2: x(0), y1: top, y2: top + rowH, stroke: css("--fg-muted"), "stroke-width": 1.5 }));
  const mean = meanOf(rows.map((r) => r.carry_delta));
  root.appendChild(svg("text", { x: 4, y: top + rowH / 2 + 4 }, clubLabel(club)));
  root.appendChild(svg("text", { x: labelW + meanW, y: top + rowH / 2 + 4, "text-anchor": "end", "font-weight": 600 }, signed(mean, 1)));
  const color = css("--after");
  rows.forEach((r, i) => {
    const y = top + 3 + i * laneH + laneH / 2;
    root.appendChild(svg("line", { x1: x(r.carry_delta_lo), x2: x(r.carry_delta_hi), y1: y, y2: y, stroke: color, "stroke-width": 2, "stroke-opacity": 0.6 }));
    for (const v of [r.carry_delta_lo, r.carry_delta_hi]) {
      root.appendChild(svg("line", { x1: x(v), x2: x(v), y1: y - 4, y2: y + 4, stroke: color, "stroke-width": 1.5, "stroke-opacity": 0.6 }));
    }
    const dot = svg("circle", { cx: x(r.carry_delta), cy: y, r: 5, fill: color, "fill-opacity": 0.85 });
    if (r.flagged) {
      dot.setAttribute("stroke", css("--attention-em"));
      dot.setAttribute("stroke-width", 2.5);
    }
    const t = svg("title");
    t.textContent = `${r.shot_id} · 計算のキャリー ${fmt(r.before.carry, 1)} → ${fmt(r.after.carry, 1)} yd · 差 ${signed(r.carry_delta, 2)} yd` +
      ` (幅 ${rangeText(r.carry_delta_lo, r.carry_delta_hi, 2, " yd")})` + (r.flagged ? ` · 確認が必要: ${r.review_flag}` : "");
    dot.appendChild(t);
    root.appendChild(dot);
    root.appendChild(svg("text", { x: W - 2, y: y + 4, "text-anchor": "end", class: "dim" }, r.shot_id));
  });
  root.appendChild(svg("line", { x1: x(mean), x2: x(mean), y1: top + 3, y2: top + rowH - 3, stroke: css("--fg"), "stroke-width": 2 }));
  root.appendChild(axis);
  return root;
}

const SIM_FOLD = { shots: false, details: false };
function simFold(key, summary) {
  const fold = el("details", "sim-fold");
  fold.open = SIM_FOLD[key];
  fold.addEventListener("toggle", () => { SIM_FOLD[key] = fold.open; });
  fold.appendChild(el("summary", "", summary));
  return fold;
}

function simShotTable(out, p) {
  const fold = simFold("shots", `球ごとの表 (今 → 変えた後・${p.n_shots} 球・外した球の理由も)`);
  const tbl = el("table", "specs sim-table");
  const head = el("tr");
  const cols = [["club_speed", "HS m/s", 1], ["ball_speed", "ボールスピード m/s", 1], ["spin", "スピン rpm", 0], ["launch", "打出角 °", 1]];
  head.appendChild(el("th", "", "球"));
  for (const [, h] of cols) head.appendChild(el("th", "num", h));
  head.appendChild(el("th", "num", "キャリー yd"));
  tbl.appendChild(head);
  const sub = el("tr");
  sub.appendChild(el("td", "muted", ""));
  const align = p.swing === "pga" || p.swing === "lpga";
  for (const [key] of cols) sub.appendChild(el("td", "num muted", key === "club_speed" && align ? "画面 → ツアー平均" : "画面 → 計算"));
  sub.appendChild(el("td", "num muted", "計算 → 計算 (差)"));
  tbl.appendChild(sub);
  const show = (key, v, d) => (v === null || v === undefined ? "—" : key === "spin" ? intText(v) : fmt(v, d));
  for (const r of p.shots) {
    const tr = el("tr");
    tr.appendChild(el("td", "", r.shot_id + (r.flagged ? " (要確認)" : "")));
    for (const [key, , d] of cols) tr.appendChild(el("td", "num", `${show(key, r.before[key], d)} → ${r.after ? show(key, r.after[key], d) : "—"}`));
    tr.appendChild(el("td", "num", `${fmt(r.before.carry, 1)} → ${r.after ? `${fmt(r.after.carry, 1)} (${signed(r.carry_delta, 1)})` : "—"}`));
    tbl.appendChild(tr);
    if (r.stage) {
      const why = el("tr");
      const td = el("td", "sim-reason", `外した (平均に入れない・記録は消していない): ${simWhyCells(r, r) || whyJa(r.reason)}`);
      td.setAttribute("colspan", String(cols.length + 2));
      why.appendChild(td);
      tbl.appendChild(why);
    }
  }
  const wrap = el("div", "scroll");
  wrap.appendChild(tbl);
  fold.appendChild(wrap);
  out.appendChild(fold);
}

function simSwapDetails(out, p) {
  const sw = p.swap, bp = sw.base_part, cp = sw.cand_part;
  const fold = simFold("details", "詳しい表 (当てはめの値・部品モデル)");
  fold.appendChild(el("h3", "sim-section", "当てはめの値 (この式に当てはめた値 — 本物のスピンロフト・反発係数・入射角ではない)"));
  const fitT = el("table", "specs sim-table");
  const fh = el("tr");
  for (const [h, num] of [["球", false], ["θ °", true], ["e", true], ["p °", true], ["δ °", true]]) fh.appendChild(el("th", num ? "num" : "", h));
  fitT.appendChild(fh);
  for (const r of p.shots.filter((x) => x.adopted && x.fit)) {
    const tr = el("tr");
    tr.appendChild(el("td", "", r.shot_id));
    tr.appendChild(el("td", "num", fmt(r.fit.theta_deg, 1)));
    tr.appendChild(el("td", "num", fmt(r.fit.e, 3)));
    tr.appendChild(el("td", "num", signed(r.fit.p_deg, 1)));
    tr.appendChild(el("td", "num", signed(r.fit.delta_deg, 1)));
    fitT.appendChild(tr);
  }
  const fw = el("div", "scroll");
  fw.appendChild(fitT);
  fold.appendChild(fw);
  fold.appendChild(el("p", "muted", `θ = 当てはめのスピンロフト・e = 当てはめの反発係数 (候補にも持ち越す)・p = 打ち出しの向きの補正・δ = θ + p − 静的ロフト (動的ロフトそのものではない)。` +
    `採用範囲 (運用上): e ${GolfPhysics.E_FIT_RANGE.join("〜")}・|p| ≤ ${GolfPhysics.P_FIT_MAX_DEG}°。`));
  fold.appendChild(el("h3", "sim-section", "部品モデル (土台 → 候補・本当の MOI ではない)"));
  const partT = el("table", "specs sim-table");
  const ph = el("tr");
  for (const [h, num] of [["", false], ["I_est kg·cm²", true], ["ヘッド g", true], ["重心 − バランス点 cm", true]]) ph.appendChild(el("th", num ? "num" : "", h));
  partT.appendChild(ph);
  for (const [name, part, src] of [[`土台 ${clubLabel(p.club)}`, bp, "測った B"], ["候補", cp, "SW からの B'"]]) {
    const tr = el("tr");
    tr.appendChild(el("td", "", name));
    tr.appendChild(el("td", "num", intText(part.i_est_kgcm2)));
    tr.appendChild(el("td", "num", gText(part.head_mass_g)));
    tr.appendChild(el("td", "num", `${signed(part.b_residual_cm, 1)} (${src})`));
    partT.appendChild(tr);
  }
  const pw = el("div", "scroll");
  pw.appendChild(partT);
  fold.appendChild(pw);
  out.appendChild(fold);
}


function drawFlows(data) {
  const box = document.getElementById("flows");
  clearNode(box);
  for (const f of FLOWS) {
    const wrap = el("div");
    const h = el("h3", "", f.title);
    if (f.full) h.title = f.full;
    wrap.appendChild(h);
    box.appendChild(wrap);
    wrap.appendChild(flowChart(data, f, box.clientWidth));
  }
}

function renderControls(data) {
  const box = document.getElementById("controls");
  clearNode(box);
  const hasTour = (key) => (data.tour || []).some((t) => t.club && tourKey(t) === key);
  const row = el("div", "control-row");
  row.appendChild(el("span", "control-title", "表示"));
  for (const [key, name, short] of SERIES) {
    if ((key === "pga" || key === "lpga") && !hasTour(key)) continue;
    const label = el("label", "check chip-check");
    label.title = name;
    label.dataset.series = key;
    const input = el("input");
    input.type = "checkbox";
    input.checked = SHOW[key];
    input.addEventListener("change", () => { SHOW[key] = input.checked; saveShow(); drawCharts(data); });
    label.appendChild(input);
    const chip = el("span", "chip-t");
    chip.appendChild(el("i", "chip-dot"));
    chip.appendChild(document.createTextNode(short));
    label.appendChild(chip);
    row.appendChild(label);
  }
  box.appendChild(row);
}

function render(data) {
  const n = data.shots.length;
  const flags = data.shots.filter(flagged).length;
  const dated = data.shots.filter((s) => s.capture_date).length;
  document.getElementById("counts").textContent = `記録 ${n} 球 · クラブ ${data.clubs.length} 本`;
  const flagText = flags ? `確認が要る球が ${flags} 球あるけど、消さずに橙の縁で出してるよ。` : "";
  document.getElementById("flag-note").textContent = flagText;
  const flagTag = document.getElementById("flag-tag");
  flagTag.hidden = !flags;
  flagTag.textContent = `◎ 要確認 ${flags}`;
  flagTag.title = flagText;
  for (const [id, v] of [["lg-carry", "--accent"], ["lg-flag", "--attention-em"]]) document.getElementById(id).style.background = css(v);
  const tours = [...new Set((data.tour || []).map((x) => x.tour))];
  if (tours.length) {
    const src = [...new Set((data.tour || []).map((x) => (x.source + (x.year ? " " + x.year : "")).trim()))].join("・");
    const lg = document.getElementById("lg-tour");
    clearNode(lg);
    for (const x of tours) {
      const lp = /^LPGA/i.test(x);
      const k = el("span", "key", (lp ? "▲ " : "◆ ") + (lp ? "LPGA" : "PGA"));
      k.style.color = css(lp ? "--lpga" : "--pga");
      k.title = (lp ? "▲ " : "◆ ") + x + " 平均 (キャリーの外部の平均・" + src + "・測る機械も条件も違う)";
      lg.appendChild(k);
    }
    const short = [...new Set((data.tour || []).map((x) => (String(x.source || "").split(" ")[0] + (x.year ? " " + x.year : "")).trim()))].join("・");
    const srcTag = el("span", "key", "外部の平均 " + short);
    srcTag.title = "外部の平均: " + src + " (パパの記録ではない)";
    lg.appendChild(srcTag);
    lg.style.gap = "14px";
  }
  const lt = document.getElementById("lg-total");
  lt.style.border = "1.5px solid " + css("--total");

  renderControls(data);
  renderSimClubs(data);
  renderArmNote(data);
  simSelfCheck(data);
  bindSim(data);
  renderSimControls(data);
  drawCharts(data);
  let timer = null;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => drawCharts(data), 150); });
  renderCellsTag(data);
  const cellsRedraw = () => {
    renderCellsTag(data);
    updateSim(data);
    drawCharts(data);
  };
  const cellsChanged = () => {
    cellsReload();
    if (typeof ShotsTable !== "undefined") ShotsTable.repaint();
    cellsRedraw();
  };
  if (typeof ShotsTable !== "undefined") ShotsTable.mount(data, cellsRedraw);
  window.addEventListener("storage", (e) => { if (e.key === CELL_KEY) cellsChanged(); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) cellsChanged(); });
  const trend = document.getElementById("trend");
  trend.textContent = dated ? `📅 ${dated} 球` : "📅 日付なし — まだ描けない";
  trend.title = dated
    ? `日付つきの記録 ${dated} 球 (推移のグラフは次の版で)`
    : `今の ${data.shots.length} 球は撮った日が分からないの。これから貼ってもらう記録には日付を入れるから、増えたらここに推移を出すね。`;
  renderSpecs(data);
}

function renderCellsTag(data) {
  const a = document.getElementById("cells-link");
  const off = cellsOff(data);
  a.textContent = off.length ? `▦ 表 · 外した ${off.length}` : "▦ 表";
  a.title = "データの表 — 使う / 使わないをますで選ぶ" + (off.length ? " · 外した: " + off.map(([id, f]) => `${id} ${cellLabel(f)}`).join(", ") : "");
  a.classList.toggle("warn", off.length > 0);
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
    render(data);
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
  .then(render)
  .catch((e) => {
    document.getElementById("error").textContent =
      "data.json が読めないの (" + e.message + ")。Live Preview で開いているか、`python swe3_detailed_design/src/export_view.py` を回したか確かめてね";
  });
}
