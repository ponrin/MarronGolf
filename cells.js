"use strict";

const CELL_KEY = "golflab-excluded-cells-v1";
const CELL_FIELDS = [
  ["club_speed", "HS", "m/s", 1], ["ball_speed", "ボールスピード", "m/s", 1], ["smash", "ミート率", "", 2],
  ["launch", "打出角", "°", 1], ["spin", "バックスピン", "rpm", 0], ["apex", "最高点", "yd", 1],
  ["carry", "キャリー", "yd", 1], ["total", "トータル", "yd", 1],
];
const CELL_FIELD_SET = new Set(CELL_FIELDS.map((f) => f[0]));
const CELLS_DEFAULT_OFF = new Set(["club_speed"]);

const CELLS = new Map();
let CELLS_DEFAULT = true;

function cellsReload() {
  CELLS.clear();
  CELLS_DEFAULT = true;
  try {
    const raw = localStorage.getItem(CELL_KEY);
    if (raw === null) return;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    CELLS_DEFAULT = false;
    for (const [id, fs] of Object.entries(v)) {
      if (!Array.isArray(fs)) continue;
      const set = new Set(fs.filter((f) => CELL_FIELD_SET.has(f)));
      if (set.size) CELLS.set(id, set);
    }
  } catch (e) {
    CELLS.clear();
    CELLS_DEFAULT = true;
  }
}

function cellsSave() {
  const out = {};
  for (const [id, set] of CELLS) if (set.size) out[id] = [...set];
  try { localStorage.setItem(CELL_KEY, JSON.stringify(out)); } catch (e) {   }
}

function candField(flag) {
  if (typeof flag !== "string") return null;
  if (/^hs_/.test(flag)) return "club_speed";
  if (flag === "high_smash_review") return "smash";
  if (flag === "low_spin_review") return "spin";
  return null;
}

const isCellUsed = (s, field) => (CELLS_DEFAULT
  ? !(CELLS_DEFAULT_OFF.has(field) && candField(s.review_flag) === field)
  : !(CELLS.get(String(s.shot_id)) || new Set()).has(field));

function cellCandidates(data) {
  const out = [];
  for (const s of data.shots || []) {
    const f = candField(s.review_flag);
    if (f) out.push([String(s.shot_id), f, s.review_flag]);
  }
  return out;
}

function cellsMaterialize(data) {
  if (!CELLS_DEFAULT) return;
  CELLS.clear();
  for (const [id, f] of cellCandidates(data)) {
    if (!CELLS_DEFAULT_OFF.has(f)) continue;
    if (!CELLS.has(id)) CELLS.set(id, new Set());
    CELLS.get(id).add(f);
  }
  CELLS_DEFAULT = false;
}

function toggleCell(data, id, field) {
  if (!CELL_FIELD_SET.has(field)) return;
  cellsMaterialize(data);
  id = String(id);
  if (!CELLS.has(id)) CELLS.set(id, new Set());
  const set = CELLS.get(id);
  if (set.has(field)) set.delete(field); else set.add(field);
  if (!set.size) CELLS.delete(id);
  cellsSave();
}

function toggleShot(data, s) {
  cellsMaterialize(data);
  const id = String(s.shot_id);
  if (CELL_FIELDS.some(([f]) => isCellUsed(s, f))) CELLS.set(id, new Set(CELL_FIELDS.map(([f]) => f)));
  else CELLS.delete(id);
  cellsSave();
}

function offCandidates(data) {
  cellsMaterialize(data);
  for (const [id, f] of cellCandidates(data)) {
    if (!CELLS.has(id)) CELLS.set(id, new Set());
    CELLS.get(id).add(f);
  }
  cellsSave();
}

function clearCells() {
  CELLS.clear();
  CELLS_DEFAULT = false;
  cellsSave();
}

function cellsOffOf(s) {
  return CELL_FIELDS.map(([f]) => f).filter((f) => !isCellUsed(s, f));
}

function cellsOff(data) {
  const out = [];
  for (const s of data.shots || []) for (const f of cellsOffOf(s)) out.push([String(s.shot_id), f]);
  return out;
}

function maskedData(data) {
  return Object.assign({}, data, {
    shots: (data.shots || []).map((s) => {
      const off = cellsOffOf(s);
      if (!off.length) return s;
      const c = Object.assign({}, s);
      for (const f of off) c[f] = null;
      return c;
    }),
  });
}

const cellLabel = (f) => (CELL_FIELDS.find((x) => x[0] === f) || [f, f])[1];

cellsReload();
