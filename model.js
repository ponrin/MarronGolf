"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

const HAS_PHYSICS = typeof GolfPhysics !== "undefined";
const NO_PHYSICS_ERROR = "physics.js が読めないの。通信を確かめて開き直してね";

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

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const signed = (v, d = 1) => (Number.isFinite(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) : "—");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
const poly = (c, x) => c[0] + c[1] * x + c[2] * x * x;
const spinParam = (cfg, ballSpeed, rpm) => Math.min(cfg.spin_parameter_max, cfg.radius_m * (rpm * 2 * Math.PI / 60) / ballSpeed);

function renderEquations(cfg, model) {
  const [a, b, c] = cfg.cd_poly, [d, e, f] = cfg.cl_poly;
  const term = (x, s) => (x < 0 ? " − " : " + ") + Math.abs(x).toFixed(4) + s;
  document.getElementById("eq-sp").textContent =
    `Sp = r ω / v   (スピンの強さ・0〜${cfg.spin_parameter_max} に制限)`;
  document.getElementById("eq-coef").textContent =
    `Cd = ${a.toFixed(4)}${term(b, " Sp")}${term(c, " Sp²")}\n` +
    `Cl = max(0, ${d.toFixed(4)}${term(e, " Sp")}${term(f, " Sp²")})`;
  document.getElementById("eq-int").textContent =
    `4 次の Runge–Kutta 法で ${cfg.dt_s} 秒 (${cfg.dt_s * 1000} ms) 刻みで積分。最長 ${cfg.max_flight_s} 秒まで。\n` +
    `スピンの減り方 k = ${cfg.spin_decay_per_s} /秒 (時定数 ${fmt(1 / cfg.spin_decay_per_s, 0)} 秒・6 秒後に ${fmt(100 * Math.exp(-6 * cfg.spin_decay_per_s), 0)}% 残る)。\n` +
    `画面の軌跡の点は ${model.every} 刻み (${model.step_s} 秒) ごとに 1 点。`;
}

function renderCoefChart(cfg, data) {
  const box = document.getElementById("coef-chart");
  const W = Math.max(320, Math.round(box.clientWidth || 640)), H = 300;
  const left = 44, right = 16, top = 14, bottom = 34, pw = W - left - right, ph = H - top - bottom;
  const xMax = 0.8, yMax = 0.45;
  const x = (v) => left + (v / xMax) * pw, y = (v) => top + ph - (v / yMax) * ph;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cd と Cl を Sp に対して描いたグラフ" });
  const grid = svg("g", { class: "grid" });
  for (let v = 0; v <= xMax + 1e-9; v += 0.1) {
    grid.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: top + ph }));
    root.appendChild(svg("text", { x: x(v), y: H - 18, "text-anchor": "middle", class: "dim" }, v.toFixed(1)));
  }
  for (let v = 0; v <= yMax + 1e-9; v += 0.1) {
    grid.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(v), y2: y(v) }));
    root.appendChild(svg("text", { x: left - 6, y: y(v) + 4, "text-anchor": "end", class: "dim" }, v.toFixed(1)));
  }
  root.insertBefore(grid, root.firstChild);
  root.appendChild(svg("text", { x: left + pw, y: H - 4, "text-anchor": "end", class: "dim" }, "Sp (スピンの強さ)"));
  const cap = cfg.spin_parameter_max;
  root.appendChild(svg("rect", { x: x(cap), y: top, width: x(xMax) - x(cap), height: ph, fill: css("--grid"), opacity: 0.8 }));
  root.appendChild(svg("text", { x: x(cap) + 4, y: top + 14, class: "dim" }, `上限 ${cap}`));
  for (const [coef, color, name, clip] of [[cfg.cd_poly, css("--drag"), "Cd (抵抗)", false], [cfg.cl_poly, css("--lift"), "Cl (揚力)", true]]) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const s = (cap * i) / 80;
      pts.push(`${x(s).toFixed(1)},${y(clip ? Math.max(0, poly(coef, s)) : poly(coef, s)).toFixed(1)}`);
    }
    root.appendChild(svg("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": 2.5 }));
    const yEnd = clip ? Math.max(0, poly(coef, cap)) : poly(coef, cap);
    root.appendChild(svg("text", { x: x(cap) - 6, y: y(yEnd) + (clip ? 16 : -8), "text-anchor": "end", fill: color, "font-weight": 600 }, name));
  }
  const marks = [];
  for (const s of data.shots) {
    if (Number.isFinite(s.ball_speed) && Number.isFinite(s.spin)) marks.push(["mine", spinParam(cfg, s.ball_speed, s.spin), s.shot_id]);
  }
  const mph = ((data.swap || {}).tour_check || {}).mph_to_mps;
  for (const t of data.tour || []) {
    const v = Number.isFinite(t.ball_speed_mph) && mph ? t.ball_speed_mph * mph : t.ball_speed;
    if (Number.isFinite(v) && Number.isFinite(t.spin)) marks.push([/^LPGA/i.test(t.tour) ? "lpga" : "pga", spinParam(cfg, v, t.spin), `${t.tour} ${t.tour_club}`]);
  }
  const rowY = { mine: top + ph - 8, pga: top + ph - 20, lpga: top + ph - 32 };
  for (const [kind, sp, label] of marks) {
    const cx = x(sp), cy = rowY[kind];
    const node = kind === "mine" ? svg("circle", { cx, cy, r: 4, fill: "none", stroke: css("--accent"), "stroke-width": 1.5 })
      : kind === "pga" ? svg("path", { d: `M${cx},${cy - 5} L${cx + 5},${cy} L${cx},${cy + 5} L${cx - 5},${cy} Z`, fill: css("--pga") })
        : svg("path", { d: `M${cx},${cy - 5} L${cx + 5},${cy + 4} L${cx - 5},${cy + 4} Z`, fill: css("--lpga") });
    const tt = svg("title");
    tt.textContent = `${label} · 打ち出しの Sp ${sp.toFixed(3)}`;
    node.appendChild(tt);
    root.appendChild(node);
  }
  box.appendChild(root);
  const sps = marks.filter((m) => m[0] === "mine").map((m) => m[1]);
  document.getElementById("coef-note").textContent =
    `下の印 = 打ち出しの時の Sp (○ 自分の球・◆ PGA 平均・▲ LPGA 平均・マウスで名前)。自分の球は Sp ${fmt(Math.min(...sps), 3)}〜${fmt(Math.max(...sps), 3)}。` +
    `飛んでいる間に速さが落ちる (Sp が大きくなる) ので、球は右へ動いていく。灰色 = 上限より右 (計算では上限で頭打ち)。` +
    `Sp = 0 でも Cl が ${cfg.cl_poly[0]} 残る — 回転しない球には使えない近似。`;
}

function renderConsts(cfg) {
  const rows = [["ボールの質量", cfg.mass_kg, "kg"], ["ボールの半径", cfg.radius_m, "m"], ["空気の密度 ρ", cfg.rho_kgm3, "kg/m³ (海面・15℃)"],
    ["重力 g", cfg.g_mps2, "m/s²"], ["Sp の上限", cfg.spin_parameter_max, ""], ["スピンの減り方 k", cfg.spin_decay_per_s, "/秒"],
    ["積分の刻み", cfg.dt_s, "秒"], ["最長の飛行時間", cfg.max_flight_s, "秒"], ["1 ヤード", cfg.yard_m, "m"],
    ["Cd の係数", (cfg.cd_poly || []).join(" / "), "Sp⁰ / Sp¹ / Sp²"], ["Cl の係数", (cfg.cl_poly || []).join(" / "), "Sp⁰ / Sp¹ / Sp² (0 未満は 0)"]];
  const t = el("table", "t");
  const head = el("tr");
  for (const h of ["定数", "値", "単位・メモ"]) head.appendChild(el("th", h === "値" ? "num" : "", h));
  t.appendChild(head);
  for (const [k, v, u] of rows) {
    const r = el("tr");
    r.appendChild(el("td", "", k));
    r.appendChild(el("td", "num", v));
    r.appendChild(el("td", "muted", u));
    t.appendChild(r);
  }
  const box = document.getElementById("consts");
  box.appendChild(t);
  box.appendChild(el("div", "muted", "仮定: " + (cfg.assumptions || []).join(" · ") + ""));
}

function renderCheck(cfg, data) {
  const mph = ((data.swap || {}).tour_check || {}).mph_to_mps;
  const t = el("table", "t");
  const head = el("tr");
  for (const [h, num] of [["", false], ["キャリー yd", true], ["最高点 yd", true], ["落下角 °", true]]) head.appendChild(el("th", num ? "num" : "", h));
  t.appendChild(head);
  const sub = el("tr");
  sub.appendChild(el("td", "muted", "打ち出しの条件 (TrackMan の平均)"));
  for (let i = 0; i < 3; i++) sub.appendChild(el("td", "num muted", "計算 / 測定 (差)"));
  t.appendChild(sub);
  const diffs = { carry: [], apex: [], land: [] };
  for (const row of data.tour || []) {
    const v = Number.isFinite(row.ball_speed_mph) && mph ? row.ball_speed_mph * mph : row.ball_speed;
    const r = el("tr");
    const name = el("td");
    name.appendChild(el("div", "", `${/^LPGA/i.test(row.tour) ? "LPGA" : "PGA"} ${row.tour_club}`));
    name.appendChild(el("div", "muted", `${fmt(v, 1)} m/s · ${fmt(row.launch, 1)}° · ${fmt(row.spin, 0)} rpm`));
    r.appendChild(name);
    const res = GolfPhysics.simulate(v, row.launch, row.spin, cfg);
    for (const [key, mkey, tol] of [["carry_yd", "carry", 8], ["apex_yd", "apex", 3], ["landing_angle_deg_down", "land_angle", 2]]) {
      if (!res.ok || !Number.isFinite(row[mkey])) { r.appendChild(el("td", "num muted", "—")); continue; }
      const d = res[key] - row[mkey];
      diffs[mkey === "land_angle" ? "land" : mkey].push(d);
      r.appendChild(el("td", Math.abs(d) > tol ? "num bad" : "num", `${fmt(res[key], 1)} / ${fmt(row[mkey], 0)} (${signed(d, 1)})`));
    }
    t.appendChild(r);
  }
  document.getElementById("check").appendChild(t);
  const rng = (xs) => (xs.length ? `${signed(Math.min(...xs), 1)}〜${signed(Math.max(...xs), 1)}` : "—");
  document.getElementById("check-note").textContent =
    `ツアーの ${(data.tour || []).length} 行の差 (計算 − 測定): キャリー ${rng(diffs.carry)} yd · 最高点 ${rng(diffs.apex)} yd · 落下角 ${rng(diffs.land)}°。` +
    `赤 = キャリー ±8 yd・最高点 ±3 yd・落下角 ±2° を超えたもの。キャリーと最高点はおおむね合うが、` +
    `落下角は全部の行で計算の方が浅い (落ち方が寝ている) — 落下角や止まりやすさの判断には使わない。` +
    `ツアー平均は平均の打出条件から 1 本計算したもので、実測の軌跡の平均ではない。TrackMan は屋外・試合と練習場の両方 (室内の X-SWING とは測り方も条件も違う)。`;
}

const tcInt = (v) => Math.round(v).toLocaleString("ja-JP");
function renderTourCheck(data, cfg, box) {
  const spec = (data.swap || {}).tour_check;
  const res = GolfPhysics.tourCheck(data.tour || [], spec, cfg);
  if (!res.ok || !res.rows.length) return;
  const name = (tc) => (tc === "3-wood" ? "3W" : tc === "5-wood" ? "5W" : tc);
  const year = res.rows[0].year;
  const h3 = el("h3", "muted", `5W → 3W・Driver の予測 (TrackMan ${year})`);
  h3.title = `この作りの答え合わせ — ツアー平均 (TrackMan ${year}) の 5W から逆算して 3W・Driver を予測`;
  box.appendChild(h3);
  const info = document.getElementById("tour-info") || box;
  const tbl = el("table", "t");
  const head = el("tr");
  for (const [h, num] of [["", false], ["ボールスピード mph", true], ["スピン rpm", true], ["打出角 °", true]]) head.appendChild(el("th", num ? "num" : "", h));
  tbl.appendChild(head);
  const sub = el("tr");
  sub.appendChild(el("td", "muted", ""));
  for (let i = 0; i < 3; i++) sub.appendChild(el("td", "num muted", `答え合わせ (モデル) / TrackMan ${year}`));
  tbl.appendChild(sub);
  for (const r of res.rows) {
    const tr = el("tr");
    tr.appendChild(el("td", "", `${/^LPGA/i.test(r.tour) ? "LPGA" : "PGA"} ${name(r.tour_club)}`));
    if (!r.ok) {
      const td = el("td", "muted", r.reason);
      td.setAttribute("colspan", "3");
      tr.appendChild(td);
    } else {
      tr.appendChild(el("td", "num", `${fmt(r.pred.ball_speed_mph, 1)} / ${fmt(r.meas.ball_speed_mph, 0)}`));
      tr.appendChild(el("td", "num", `${tcInt(r.pred.spin)} / ${tcInt(r.meas.spin)}`));
      tr.appendChild(el("td", "num", `${fmt(r.pred.launch, 1)} / ${fmt(r.meas.launch, 1)}`));
    }
    tbl.appendChild(tr);
  }
  const wrap = el("div", "scroll");
  wrap.appendChild(tbl);
  box.appendChild(wrap);
  const clubs = spec.clubs || {};
  const assumed = ["Driver", "3-wood", "5-wood"].filter((k) => clubs[k])
    .map((k) => `${name(k)} ${fmt(clubs[k].loft_deg, 0)}° ${fmt(clubs[k].head_mass_g, 0)} g`).join("・");
  info.appendChild(el("p", "muted", `ツアーのクラブのロフトとヘッド質量は${spec.source}: ${assumed}。` +
    "HS は TrackMan の本物の値を使った (HS を見積もる式とは別)。ツアー平均は答え合わせ専用で、自分の計算の土台には使わない。"));
  const ok = res.rows.filter((r) => r.ok);
  if (!ok.length) return;
  const per = (tc) => ok.filter((r) => r.tour_club === tc);
  const launchGap = spec.targets.filter((tc) => per(tc).length)
    .map((tc) => `${name(tc)} で平均 ${fmt(per(tc).reduce((a, r) => a + (r.meas.launch - r.pred.launch), 0) / per(tc).length, 1)}°`).join("・");
  const bsGap = ok.map((r) => r.pred.ball_speed_mph - r.meas.ball_speed_mph);
  const spinBy = [...new Set(ok.map((r) => r.tour))].map((t) => {
    const q = ok.filter((r) => r.tour === t).map((r) => r.pred.spin / r.meas.spin);
    return `${/^LPGA/i.test(t) ? "LPGA" : "PGA"} ×${fmt(Math.min(...q), 2)}〜${fmt(Math.max(...q), 2)}`;
  }).join("・");
  info.appendChild(el("p", "muted", `今回の比較: ボールスピードの差は ${signed(Math.min(...bsGap), 1)}〜${signed(Math.max(...bsGap), 1)} mph・` +
    `スピンは TrackMan の ${spinBy}・打出角はモデルが低く出た (${launchGap})。` +
    "入射角や動的ロフトは逆算の当てはめ (p・δ) に吸い込まれていて、本物の値とは別。"));
}

const N_HUMAN = 0.26;
const flaggedShot = (s) => s.review_flag && s.review_flag !== "review_not_required";

const WEDGES = { includes: (c) => c === "PW" || /^\d+deg$/.test(String(c)) };
const N_FIX = 0.25;
let ARM_M = HAS_PHYSICS ? GolfPhysics.ARM_DEFAULT_M : NaN, EVAL_WEDGE = false, CM_PER_IN = NaN;
const cm = (L) => L * CM_PER_IN;
const jOf = (c, Rm) => GolfPhysics.hubJ(c.I, c.mass, c.b, Rm);

const armLabel = (a) => (Math.round(a * 1000) / 1000).toFixed(3).replace(/0$/, "");

function clearNode(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
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

function swingModels(H0, L0, I0, armM, base) {
  const J0 = jOf(base, armM);
  const F = (L, X0, X) => H0 * GolfPhysics.hsFactor(cm(L0), cm(L), X0, X, N_FIX, armM);
  return [
    { key: "arm", name: `腕 + クラブ (腕 ${armLabel(armM)} m)`, color: "--arm", dash: "", f: (L) => F(L, 1, 1) },
    { key: "armGrip", name: "腕 + クラブ × グリップ端の MOI (中心)", color: "--grip", dash: "", points: true, f: (L, I) => F(L, I0, I) },
    { key: "armHub", name: "腕 + クラブ × 肩まわりの MOI", color: "--arm", dash: "2 3", points: true, f: (L, I, c) => F(L, J0, jOf(c, armM)) },
  ];
}

function mackenzie(data, Rm) {
  const I0 = 2539, I1 = 2867, dm = 26;
  const drv = data.clubs.find((c) => c.club === "Driver"), p = ((drv || {}).parts || [])[0];
  const grip = GolfPhysics.hsRatio(I0, I1, N_FIX);
  if (!p) return { grip, hub: NaN };
  const r = Math.sqrt((I1 - I0) * 1e-4 / (dm / 1000));
  const J0 = GolfPhysics.hubJ(I0, drv.total_mass_g, p.b_pred_cm, Rm), J1 = J0 + (dm / 1000) * (Rm + r) ** 2;
  return { grip, hub: GolfPhysics.hsFactor(p.length_cm, p.length_cm, J0, J1, N_FIX, Rm) };
}

function swingPoints(data) {
  const clubs = Object.fromEntries(data.clubs.map((c) => [c.club, c]));
  const mean = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length;
  const pts = [];
  for (const name of data.order) {
    const c = clubs[name], shots = data.shots.filter((s) => s.club === name && Number.isFinite(s.club_speed));
    if (!c || !shots.length || !Number.isFinite(c.length_in)) continue;
    const ok = shots.filter((s) => isCellUsed(s, "club_speed"));
    const part = (c.parts || [])[0] || {};
    pts.push({ club: name, L: c.length_in, hs: mean(shots.map((s) => s.club_speed)), hsOk: ok.length ? mean(ok.map((s) => s.club_speed)) : null,
      n: shots.length, nOk: ok.length, nFlag: shots.length - ok.length, I: part.i_est_kgcm2, mass: c.total_mass_g, b: part.b_pred_cm });
  }
  return { clubs, pts };
}

function swingErrors(models, pts, evalWedge) {
  const target = pts.filter((p) => p.club !== "5I" && Number.isFinite(p.hsOk) && Number.isFinite(p.I) && (evalWedge || !WEDGES.includes(p.club)));
  return models.map((m) => {
    const d = target.map((p) => ({ club: p.club, d: m.f(p.L, p.I, p) - p.hsOk }));
    const rmse = Math.sqrt(d.reduce((a, x) => a + x.d * x.d, 0) / (d.length || 1));
    const worst = d.reduce((a, x) => (Math.abs(x.d) > Math.abs(a.d) ? x : a), { club: "", d: 0 });
    return { m, rmse, worst, n: d.length, d };
  });
}

function bestArm(H0, L0, I0, base, pts, evalWedge, key) {
  let best = null;
  for (let i = 0; i <= 90; i++) {
    const a = 0.30 + i * 0.01;
    const e = swingErrors(swingModels(H0, L0, I0, a, base).filter((m) => m.key === key), pts, evalWedge)[0];
    if (!best || e.rmse < best.rmse) best = { arm: a, rmse: e.rmse };
  }
  return best;
}

function renderSwing(cfg, data) {
  const box = document.getElementById("swing-chart"), acc = document.getElementById("swing-acc");
  clearNode(box);
  clearNode(acc);
  const { clubs, pts } = swingPoints(data);
  const base = pts.find((p) => p.club === "5I");
  if (!base || !base.nOk) { box.appendChild(el("div", "muted", "基準にする 5I の記録が無いので描けないの")); return; }
  if (!Number.isFinite(CM_PER_IN)) { box.appendChild(el("div", "muted", "data.json に in → cm の換算 (swap.parts_model.in_to_cm) が無いので描けないの")); return; }
  const H0 = base.hsOk, L0 = base.L, I0 = base.I;
  const models = swingModels(H0, L0, I0, ARM_M, base);
  const W = Math.max(320, Math.round(box.clientWidth || 640)), H = 340;
  const left = 44, right = 16, top = 14, bottom = 34, pw = W - left - right, ph = H - top - bottom;
  const xMin = 35, xMax = 46, yMin = 30, yMax = 46;
  const x = (v) => left + ((v - xMin) / (xMax - xMin)) * pw, y = (v) => top + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "クラブの長さと HS: 自分の記録と式の線" });
  const grid = svg("g", { class: "grid" });
  for (let v = xMin; v <= xMax + 1e-9; v += 1) {
    grid.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: top + ph }));
    root.appendChild(svg("text", { x: x(v), y: H - 18, "text-anchor": "middle", class: "dim" }, String(v)));
  }
  for (let v = yMin; v <= yMax + 1e-9; v += 2) {
    grid.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(v), y2: y(v) }));
    root.appendChild(svg("text", { x: left - 6, y: y(v) + 4, "text-anchor": "end", class: "dim" }, String(v)));
  }
  root.appendChild(grid);
  root.appendChild(svg("text", { x: left + pw, y: H - 4, "text-anchor": "end", class: "dim" }, "クラブの長さ in"));
  root.appendChild(svg("text", { x: left + 6, y: top + 10, class: "dim" }, "HS m/s"));
  const drv = clubs.Driver;
  if (drv && Number.isFinite(drv.length_in)) {
    root.appendChild(svg("line", { x1: x(drv.length_in), x2: x(drv.length_in), y1: top, y2: top + ph, stroke: css("--fg-muted"), "stroke-dasharray": "3 4" }));
    const drvLabel = pts.some((p) => p.club === "Driver") ? "Driver" : "Driver (未測定)";
    root.appendChild(svg("text", { x: x(drv.length_in) - 4, y: top + 24, "text-anchor": "end", class: "dim" }, drvLabel));
  }
  const specs = data.order.map((k) => clubs[k]).filter((c) => c && Number.isFinite(c.length_in) && ((c.parts || [])[0] || {}).i_est_kgcm2)
    .map((c) => ({ club: c.club, L: c.length_in, I: c.parts[0].i_est_kgcm2, mass: c.total_mass_g, b: c.parts[0].b_pred_cm, rec: pts.some((p) => p.club === c.club) }));
  const labelAt = { arm: 46 };
  for (const m of models) {
    if (m.points) {
      const ps = specs.map((c) => [c.L, m.f(c.L, c.I, c), c]);
      root.appendChild(svg("polyline", { points: ps.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" "), fill: "none",
        stroke: css(m.color), "stroke-width": 1.5, "stroke-dasharray": m.dash }));
      for (const [a, b, c] of ps) {
        const dot = svg("circle", { cx: x(a), cy: y(b), r: c.rec ? 3 : 4, fill: c.rec ? css(m.color) : css("--canvas"), stroke: css(m.color), "stroke-width": 1.5 });
        const t = svg("title");
        t.textContent = `${m.name} · ${c.club.replace("deg", "°")} · ${fmt(b, 1)} m/s` + (c.rec ? "" : " (自分の記録は無い・仕様だけで計算)");
        dot.appendChild(t);
        root.appendChild(dot);
      }
    } else {
      const p = [];
      for (let L = xMin; L <= xMax + 1e-9; L += 0.25) p.push(`${x(L).toFixed(1)},${y(m.f(L)).toFixed(1)}`);
      root.appendChild(svg("polyline", { points: p.join(" "), fill: "none", stroke: css(m.color), "stroke-width": m.key === "arm" ? 2.5 : 2, "stroke-dasharray": m.dash }));
      const at = labelAt[m.key] || xMax;
      root.appendChild(svg("text", { x: x(at) - 4, y: y(m.f(at)) + (m.key === "arm" ? 16 : -6), "text-anchor": "end", fill: css(m.color), "font-weight": 600 }, m.name));
    }
  }
  for (const c of specs.filter((c) => !c.rec)) {
    const b = models.find((m) => m.key === "armHub").f(c.L, c.I, c);
    root.appendChild(svg("text", { x: x(c.L), y: y(b) - 8, "text-anchor": "middle", class: "dim" }, c.club.replace("deg", "°")));
  }
  for (const p of pts) {
    const dot = svg("circle", { cx: x(p.L), cy: y(p.hs), r: 6, fill: css("--accent") });
    const t = svg("title");
    t.textContent = `${p.club} · 長さ ${p.L} in · HS 平均 ${fmt(p.hs, 1)} m/s (${p.n} 球)` + (p.nFlag ? ` · HS を外した ${p.nFlag} 球を除くと ${fmt(p.hsOk, 1)}` : "");
    dot.appendChild(t);
    root.appendChild(dot);
    if (p.nFlag && Number.isFinite(p.hsOk)) root.appendChild(svg("circle", { cx: x(p.L), cy: y(p.hsOk), r: 6, fill: "none", stroke: css("--accent"), "stroke-width": 2 }));
    root.appendChild(svg("text", { x: x(p.L), y: y(p.hs) - 10, "text-anchor": "middle", class: "dim" }, p.club.replace("deg", "°")));
  }
  box.appendChild(root);
  const errs = swingErrors(models, pts, EVAL_WEDGE).sort((a, b) => a.rmse - b.rmse);
  const t = el("table", "t");
  const head = el("tr");
  for (const [h, num] of [["式 (どれも 5I に合わせた)", false], ["RMSE m/s", true], ["一番ずれる番手", false]]) head.appendChild(el("th", num ? "num" : "", h));
  t.appendChild(head);
  errs.forEach((e, i) => {
    const r = el("tr");
    r.title = e.d.map((x) => `${x.club.replace("deg", "°")} ${signed(x.d, 2)}`).join(" · ");
    const name = el("td");
    const sw = el("span", "swatch");
    sw.style.background = css(e.m.color);
    name.appendChild(sw);
    name.appendChild(el("span", i === 0 ? "best" : "", e.m.name + (i === 0 ? "  ← 今いちばん合う" : "")));
    r.appendChild(name);
    r.appendChild(el("td", "num", fmt(e.rmse, 2)));
    r.appendChild(el("td", "muted", e.worst.club ? `${e.worst.club.replace("deg", "°")} ${signed(e.worst.d, 2)}` : "—"));
    t.appendChild(r);
  });
  acc.appendChild(t);
  const bArm = bestArm(H0, L0, I0, base, pts, EVAL_WEDGE, "arm"), bArmM = bestArm(H0, L0, I0, base, pts, EVAL_WEDGE, "armHub");
  const bArmG = bestArm(H0, L0, I0, base, pts, EVAL_WEDGE, "armGrip");
  const used = errs[0].d.map((x) => x.club.replace("deg", "°")).join("・");
  const b5 = data.shots.filter((s) => s.club === "5I" && Number.isFinite(s.club_speed) && isCellUsed(s, "club_speed")).map((s) => s.club_speed);
  const m5 = b5.reduce((a, v) => a + v, 0) / b5.length;
  const sd5 = b5.length > 1 ? Math.sqrt(b5.reduce((a, v) => a + (v - m5) ** 2, 0) / (b5.length - 1)) : NaN;
  const edge = (b) => b.arm <= 0.305 || b.arm >= 1.195;
  document.getElementById("swing-note").textContent =
    `● 自分の番手ごとの HS の平均 (X-SWING の画面の値) · ○ HS のますを外した球を除いた平均 (違う番手だけ・表 → で選ぶ) · 白抜きの点 = 記録の無い番手 (仕様だけで計算)。` +
    `どの式も 5I (${base.nOk} 球・${fmt(H0, 2)} m/s・平均の標準誤差 ${fmt(sd5 / Math.sqrt(b5.length), 2)} m/s) に合わせた「同じように振れたら」の計算。` +
    `「腕 + クラブ」= 腕とクラブが一直線で同じ角速度を持つと仮定した比較式 (ヘッドの速さ = 角速度 × (肩から手首 + クラブの長さ))。` +
    `「× グリップ端の MOI (中心)」「× 肩まわりの MOI」は、それにクラブの MOI の補正 (経験) (X_5I / X)^${N_FIX} を掛けたもの — 画面の「ボールの軌跡とシミュレーション」(重さを足す・クラブを替える) と同じ式で、` +
    `X = グリップ端まわりのクラブの MOI (部品モデルの I_est) か、肩まわりの全体の MOI J = 腕 + I + m (R² + 2 R b) (腕の質量 ${GolfPhysics.ARM_MASS_KG} kg・慣性は Lampsa 1975 の仮定・b = 部品モデルの重心)。` +
    `指数 ${N_FIX} はクラブのグリップ端まわりの MOI に当てはめた値 (棒を振る実験) で、肩まわりの J に使うのは転用。二重振り子から導いた理論式ではない (角速度の比やリリースは解いていない)。` +
    `グリップ端を中心に回すと置く式 (長さに比例・式 M・長さのべき乗) は、腕の分の半径を無視するので理論式として使わない。`;
  document.getElementById("swing-acc-note").textContent =
    `答え合わせに使った番手: ${used} (HS のますを外した球を除いた平均・基準の 5I は除く${EVAL_WEDGE ? "・ウェッジも入れた" : "・ウェッジは外した"})。` +
    `球数の少ない番手があり、5I の平均にも標準誤差 ${fmt(sd5 / Math.sqrt(b5.length), 2)} m/s があるので、今の記録では順位の不確かさを十分に評価できない (行にマウスで番手ごとの差)。` +
    `記録が少ないうちは、グリップ端と肩まわりのどちらが良いかは決まらない (1 球の差は合否の境界ではない)。` +
    `当てはめた「腕の長さ」(腕 + クラブ ${fmt(bArm.arm, 2)} m・RMSE ${fmt(bArm.rmse, 2)} / × 肩まわり ${fmt(bArmM.arm, 2)} m・RMSE ${fmt(bArmM.rmse, 2)} / ` +
    `× グリップ端 ${fmt(bArmG.arm, 2)} m・RMSE ${fmt(bArmG.rmse, 2)}) は、` +
    `腕とクラブの角速度の比も吸い込んだ有効なパラメータで、人の腕の長さとは読めない (同じ記録で合わせた値${edge(bArm) || edge(bArmM) || edge(bArmG) ? "・探し方の端の値を含む" : ""})。` +
    `どの式が一番かを決めるには、条件をそろえた記録が要る (下の「確かさを上げるには」)。`;
}

function bindSwingControls(cfg, data) {
  const arm = document.getElementById("arm-len"), armV = document.getElementById("arm-len-v"), wedge = document.getElementById("eval-wedge");
  CM_PER_IN = ((data.swap || {}).parts_model || {}).in_to_cm;
  const body = GolfPhysics.armFromBody(data.profile);
  arm.value = body.R_m.toFixed(3);
  const src = document.getElementById("arm-len-src");
  if (body.source === "height") {
    src.title =
      `(最初の値 = 身長 ${body.H} cm から ${armLabel(body.R_m)} m: 肩→手首 ${body.arm.toFixed(1)} cm と両肩の真ん中→肩 ${body.half.toFixed(1)} cm の斜めの距離` +
      (body.hubWrist ? ` · 自分で測った手首の高さ ${data.profile.wrist_to_floor_cm} cm (身長の比なら ${body.wristRatio.toFixed(1)} cm) からだと ${armLabel(body.hubWrist)} m` : "") +
      ` · Lampsa 0.615 · White 0.67 · 画面の計算は丸めない ${body.R_m.toFixed(6)} m)`;
  } else {
    src.title = `(最初の値 = Lampsa 1975 の ${armLabel(body.R_m)} m — data.json に身長が無い · White 0.67)`;
  }
  src.textContent = "(出所)";
  src.style.cursor = "help";
  const redraw = () => {
    ARM_M = Number(arm.value);
    EVAL_WEDGE = wedge.checked;
    armV.textContent = `${armLabel(ARM_M)} m`;
    renderSwing(cfg, data);
    renderSwingMass(cfg, data);
  };
  arm.addEventListener("input", redraw);
  wedge.addEventListener("change", redraw);
  redraw();
}

const MASS_SERIES = [["I", "グリップ端の MOI", "--grip"], ["J", "肩まわりの MOI", "--arm"]];

function renderSwingMass(cfg, data) {
  const box = document.getElementById("swing-mass");
  clearNode(box);
  const clubs = Object.fromEntries(data.clubs.map((c) => [c.club, c]));
  const spec = (c) => ({ I: c.parts[0].i_est_kgcm2, mass: c.total_mass_g, b: c.parts[0].b_pred_cm, Lcm: c.parts[0].length_cm,
    head: c.parts[0].head_mass_g, x_h: c.parts[0].head_pos_cm });
  const base = clubs["5I"];
  if (!base || !((base.parts || [])[0] || {}).i_est_kgcm2) return;
  const s5 = spec(base);
  const J0 = GolfPhysics.hubJ(s5.I, s5.mass, s5.b, ARM_M);
  const corr = (X0, X, Lcm) => (GolfPhysics.hsFactor(Lcm, Lcm, X0, X, N_FIX, ARM_M) - 1) * 100;
  const rows = data.order.map((k) => clubs[k]).filter((c) => c && ((c.parts || [])[0] || {}).i_est_kgcm2)
    .map((c) => {
      const sp = spec(c), J = GolfPhysics.hubJ(sp.I, sp.mass, sp.b, ARM_M);
      return { club: c.club, pct: { I: corr(s5.I, sp.I, sp.Lcm), J: corr(J0, J, sp.Lcm) }, mass: c.total_mass_g, head: sp.head, I: sp.I, J };
    });
  const W = Math.max(320, Math.round(box.clientWidth || 640)), H = 180;
  const left = 44, right = 16, top = 12, bottom = 30, pw = W - left - right, ph = H - top - bottom;
  const lim = 2;
  const y = (v) => top + ph / 2 - (Math.max(-lim, Math.min(lim, v)) / lim) * (ph / 2);
  const bw = pw / rows.length;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "番手ごとの MOI の補正分 (グリップ端 / 肩まわり) の棒グラフ" });
  const grid = svg("g", { class: "grid" });
  for (const v of [-2, -1, 0, 1, 2]) {
    grid.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(v), y2: y(v) }));
    root.appendChild(svg("text", { x: left - 6, y: y(v) + 4, "text-anchor": "end", class: "dim" }, (v > 0 ? "+" : "") + v + "%"));
  }
  root.appendChild(grid);
  root.appendChild(svg("line", { x1: left, x2: left + pw, y1: y(0), y2: y(0), stroke: css("--fg-muted") }));
  rows.forEach((r, i) => {
    const cx = left + bw * (i + 0.5), w = bw * 0.36;
    MASS_SERIES.forEach(([key, name, color], k) => {
      const v = r.pct[key], x0 = cx - w + k * w, h = Math.abs(y(v) - y(0));
      const bar = svg("rect", { x: x0 + 1, y: Math.min(y(v), y(0)), width: w - 2, height: Math.max(h, 1), fill: css(color), "fill-opacity": 0.85 });
      const t = svg("title");
      t.textContent = `${r.club.replace("deg", "°")} · MOI の補正分 (${name}) ${signed(v, 2)}% · 総重量 ${fmt(r.mass, 0)} g · ヘッド ${fmt(r.head, 0)} g (推定) · ` +
        `グリップ端の MOI ${fmt(r.I, 0)} kg·cm² · 肩まわりの MOI ${fmt(r.J, 3)} kg·m²`;
      bar.appendChild(t);
      root.appendChild(bar);
      root.appendChild(svg("text", { x: x0 + w / 2, y: v < 0 ? y(v) + 11 : y(v) - 3, "text-anchor": "middle", class: "dim" }, signed(v, 1)));
    });
    root.appendChild(svg("text", { x: cx, y: H - 10, "text-anchor": "middle" }, r.club.replace("deg", "°")));
  });
  box.appendChild(root);
  const lg = el("div", "muted");
  for (const [, name, color] of MASS_SERIES) {
    const sw = el("span", "swatch");
    sw.style.background = css(color);
    lg.appendChild(sw);
    lg.appendChild(el("span", "", name + "   "));
  }
  box.appendChild(lg);
  const mass = rows.map((r) => r.mass).filter(Number.isFinite);
  const pick = (key, better) => rows.reduce((a, r) => (better(r.pct[key], a.pct[key]) ? r : a));
  const hiJ = pick("J", (a, b) => a > b), loJ = pick("J", (a, b) => a < b), hiI = pick("I", (a, b) => a > b), loI = pick("I", (a, b) => a < b);
  const name = (r) => r.club.replace("deg", "°");
  const dHead = 0.01 * (ARM_M + s5.x_h / 100) ** 2 / J0 * 100, dGrip = 0.01 * (ARM_M + 0.18) ** 2 / J0 * 100;
  const mk = mackenzie(data, ARM_M), drv = rows.find((r) => r.club === "Driver");
  document.getElementById("swing-mass-note").textContent =
    `5I を 0 にした時の、MOI の補正分 = (5I の MOI ÷ その番手の MOI)^${N_FIX} − 1 を、グリップ端の MOI (中心) と肩まわりの MOI の 2 本で。` +
    `長さによる慣性の変化も含む (長い番手ほどグリップ端の MOI は大きい)。腕 ${armLabel(ARM_M)} m (つまみと同じ)・腕の質量と慣性は Lampsa 1975 の仮定。` +
    `肩まわりでは、クラブの総重量そのものが効く (クラブの質量 × 肩からの距離² の項): 一番回しやすいのは ${name(hiJ)} (${fmt(hiJ.mass, 0)} g・${signed(hiJ.pct.J, 1)}%)、` +
    `一番回しにくいのは ${name(loJ)} (${fmt(loJ.mass, 0)} g・${signed(loJ.pct.J, 1)}%)。総重量が ${fmt(Math.max(...mass) - Math.min(...mass), 0)} g 違っても 肩まわりの差が ${fmt(hiJ.pct.J - loJ.pct.J, 1)}% の幅に収まるのは、` +
    `腕の慣性 (${fmt(GolfPhysics.ARM_I_HUB, 2)} kg·m²) が大きいから。グリップ端では ${name(hiI)} が ${signed(hiI.pct.I, 1)}%・${name(loI)} が ${signed(loI.pct.I, 1)}%。` +
    (drv && drv.pct.I < 0 && drv.pct.J > 0 ? `番手どうしでは 2 本の向きが違って見えるが、どちらも定義どおり (Driver は 5I より軽い (${fmt(drv.mass, 0)} g) が長いのでグリップ端の MOI は大きい → グリップ端では回しにくい側・肩まわりでは回しやすい側)。` : "") +
    `どこに付けるかで違う: 5I に 10 g を足すと肩まわりの MOI はヘッドで ${fmt(dHead, 2)}%・グリップ端から 18 cm で ${fmt(dGrip, 2)}% 増える。` +
    `MacKenzie 2015 の 1 条件 (同じ長さで Driver のヘッド 174 → 200 g): 実験の HS −2.49% に対して、グリップ端の MOI (2539 → 2867 kg·cm²) で ${signed((mk.grip - 1) * 100, 2)}%・` +
    `肩まわりの MOI で ${signed((mk.hub - 1) * 100, 2)}% (肩まわりは、クラブの質量と重心が論文に無いので自分の Driver を借りた)。` +
    `実験の値が 2 つの式の間に入るのは 1 条件での一致で、式が正しい保証ではない。` +
    `指数 ${N_FIX} はグリップ端の MOI に当てはめた値で、肩まわりに使うのは転用。クラブの MOI は部品モデルの推定 (本当の MOI ではない)・シャフト重量が未確定の番手は仮定の値。`;
}

function renderMopt(cfg, data) {
  const m = cfg.mass_kg * 1000;
  const t = el("table", "t");
  const head = el("tr");
  for (const [h, num] of [["HS の質量の指数 n_M", false], ["M_opt", true], ["メモ", false]]) head.appendChild(el("th", num ? "num" : "", h));
  t.appendChild(head);
  for (const [n, memo] of [[1 / 5.3, "Daish 1972 (Cross & Bower 2006 の引用)"], [0.15, ""], [0.22, ""], [0.25, ""]]) {
    const r = el("tr");
    r.appendChild(el("td", "", n === 1 / 5.3 ? "1/5.3 (= 0.189)" : String(n)));
    r.appendChild(el("td", "num", fmt(m * (1 / n - 1), 0) + " g"));
    r.appendChild(el("td", "muted", memo));
    t.appendChild(r);
  }
  document.getElementById("mopt").appendChild(t);
  const heads = data.clubs.map((c) => [c.club.replace("deg", "°"), ((c.parts || [])[0] || {}).head_mass_g]).filter(([, v]) => Number.isFinite(v));
  document.getElementById("mopt-note").textContent =
    `ボール m = ${fmt(m, 2)} g (data.json の係数)。最適の近くは平ら: 136〜283 g でボールスピードの低下は 1% 以内 (Daish)。` +
    `自分のヘッドの見積もり (総重量 − シャフト − グリップ 50 g): ` + heads.map(([k, v]) => `${k} ${fmt(v, 0)} g`).join(" · ") + "。" +
    `cos θ は外に掛かる係数なので、フェースに垂直な成分 v_n の最適はロフトに依らない (e が質量で変わらない時)。スピンや合わせたボールスピードの最適までは、この表のままとは言えない。` +
    `この M_opt は反発係数 e が質量で変わらない時だけ。White 2006 の「197.5 g」はエネルギーの伝わり方の効率の最適で、飛距離の最適ではない。`;
}

function renderCellsTag(data) {
  const off = cellsOff(data);
  const a = document.getElementById("cells-link");
  a.textContent = off.length ? `▦ 表 · 外した ${off.length} →` : "▦ 表 →";
  a.title = "データの表 — 使う / 使わないをますで選ぶ" + (off.length ? " · 外した: " + off.map(([id, f]) => `${id} ${cellLabel(f)}`).join(", ") : "");
  a.classList.toggle("warn", off.length > 0);
  const hs = off.filter(([, f]) => f === "club_speed").map(([id]) => id);
  const tag = document.getElementById("excl-count");
  tag.hidden = hs.length === 0;
  tag.textContent = `HS を外した ${hs.length} 球`;
  tag.title = hs.join(", ") + " — 答え合わせと基準の 5I から除く (表 → で切り替え)";
}

loadData()
  .then((data) => {
    renderCellsTag(data);
    window.addEventListener("storage", (e) => { if (e.key === CELL_KEY) location.reload(); });
    window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
    const model = (data.trajectories || {}).model || {};
    const cfg = model.config;
    if (!cfg) throw new Error("data.json に弾道の係数 (trajectories.model.config) が無い");
    renderEquations(cfg, model);
    renderCoefChart(cfg, data);
    renderConsts(cfg);
    if (HAS_PHYSICS) {
      renderCheck(cfg, data);
      renderTourCheck(data, cfg, document.getElementById("tour-check"));
      bindSwingControls(cfg, data);
    } else {
      document.getElementById("error").textContent = NO_PHYSICS_ERROR;
      for (const id of ["check", "tour-check", "swing-chart", "swing-acc", "swing-mass"]) {
        document.getElementById(id).textContent = "physics.js が読めないので出していない";
      }
      for (const id of ["arm-len", "eval-wedge"]) document.getElementById(id).disabled = true;
    }
    renderMopt(cfg, data);
  })
  .catch((e) => {
    document.getElementById("error").textContent =
      "データが読めないの (" + e.message + ")。通信を確かめて開き直してね" +
      (HAS_PHYSICS ? "" : " ／ " + NO_PHYSICS_ERROR);
  });
