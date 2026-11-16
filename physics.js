var GolfPhysics = (function () {
  "use strict";

  var N_CENTER = 0.25;
  var N_BAND = [0.19, 0.28];
  var DM_LIMIT_G = 100;
  var PIVOT_14IN_CM = 35.56;
  var SELF_CHECK_TOL_YD = 0.06;

  var ARM_MASS_KG = 7.312;
  var ARM_CG_M = 0.326;
  var ARM_ICM = 0.373;
  var ARM_I_HUB = ARM_ICM + ARM_MASS_KG * ARM_CG_M * ARM_CG_M;
  var ARM_DEFAULT_M = 0.615;
  var MODELS = ["I", "J"];
  var DC = { upper: 0.186, fore: 0.146, shoulder: 0.818, wrist: 0.485, halfShoulder: 0.129 };

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  function isNum(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  function armProblem(R) {
    return isNum(R) && R > 0 ? null : "腕の長さ (肩から手首 R [m]) が正の数ではない";
  }

  function hubJ(I_kgcm2, m_g, b_cm, R_m) {
    return ARM_I_HUB + I_kgcm2 * 1e-4 + (m_g / 1000) * (R_m * R_m + 2 * R_m * b_cm / 100);
  }

  function hsFactor(L_cm, L2_cm, X, X2, n, R_m) {
    return (R_m + L2_cm / 100) / (R_m + L_cm / 100) * Math.pow(X / X2, n);
  }

  function armFromBody(p) {
    var H = p && typeof p === "object" ? p.height_cm : undefined;
    if (!(isNum(H) && H > 0)) return { ok: true, R_m: ARM_DEFAULT_M, source: "lampsa" };
    var arm = (DC.upper + DC.fore) * H, half = DC.halfShoulder * H;
    var armWrist = isNum(p.wrist_to_floor_cm) ? DC.shoulder * H - p.wrist_to_floor_cm : null;
    return {
      ok: true, R_m: Math.hypot(arm, half) / 100, source: "height", H: H, arm: arm, half: half,
      hubWrist: armWrist ? Math.hypot(armWrist, half) / 100 : null, armWrist: armWrist, wristRatio: DC.wrist * H,
    };
  }

  var CONFIG_NUMS = ["mass_kg", "radius_m", "rho_kgm3", "g_mps2", "spin_parameter_max", "spin_decay_per_s",
    "dt_s", "max_flight_s", "yard_m"];
  var BALL_SPEED_MAX_MPS = 150;
  var LAUNCH_MAX_DEG = 90;
  var SPIN_MAX_RPM = 30000;

  function flightInputProblem(ballSpeed, launchDeg, spinRpm) {
    if (!(isNum(ballSpeed) && 0 < ballSpeed && ballSpeed < BALL_SPEED_MAX_MPS)) {
      return "ボールスピードは 0〜" + BALL_SPEED_MAX_MPS + " m/s の数 (Python と同じ)";
    }
    if (!(isNum(launchDeg) && isNum(spinRpm) && 0 < launchDeg && launchDeg < LAUNCH_MAX_DEG && 0 <= spinRpm &&
      spinRpm < SPIN_MAX_RPM)) {
      return "打出角は 0〜" + LAUNCH_MAX_DEG + "°・スピンは 0〜" + SPIN_MAX_RPM + " rpm (Python と同じ)";
    }
    return null;
  }

  function configProblem(cfg) {
    if (!cfg || typeof cfg !== "object") return "弾道の係数 (config) が無い";
    for (var i = 0; i < CONFIG_NUMS.length; i++) {
      if (!isNum(cfg[CONFIG_NUMS[i]])) return "弾道の係数 " + CONFIG_NUMS[i] + " が数ではない";
    }
    var polys = ["cd_poly", "cl_poly"];
    for (var j = 0; j < polys.length; j++) {
      var p = cfg[polys[j]];
      if (!Array.isArray(p) || p.length !== 3 || !p.every(isNum)) return "弾道の係数 " + polys[j] + " は 3 つの数";
    }
    return null;
  }

  function fly(ballSpeed, launchDeg, spinRpm, config, every) {
    var problem = configProblem(config);
    if (problem) return fail(problem);
    var cfg = Object.assign({}, config);
    var inputBad = flightInputProblem(ballSpeed, launchDeg, spinRpm);
    if (inputBad) return fail(inputBad);
    var dt = cfg.dt_s;
    if (dt <= 0 || dt > 0.05) return fail("積分の刻みが対応外");
    var mass = cfg.mass_kg, r = cfg.radius_m, area = Math.PI * r * r;
    var cdp = cfg.cd_poly, clp = cfg.cl_poly;
    function deriv(s) {
      var vx = s[2], vy = s[3], w = s[4];
      var v = Math.hypot(vx, vy);
      var sp = Math.min(cfg.spin_parameter_max, Math.max(0, r * w / Math.max(v, 1e-12)));
      var a = cdp[0], b = cdp[1], c = cdp[2], d = clp[0], e = clp[1], f = clp[2];
      var cd = a + b * sp + c * sp * sp, cl = Math.max(0, d + e * sp + f * sp * sp);
      var q = 0.5 * cfg.rho_kgm3 * area * v * v;
      var denom = Math.max(v, 1e-12) * mass;
      var ax = q * (-cd * vx - cl * vy) / denom;
      var ay = q * (-cd * vy + cl * vx) / denom - cfg.g_mps2;
      return [vx, vy, ax, ay, -cfg.spin_decay_per_s * w];
    }
    function step(s, k, h) {
      var out = new Array(5);
      for (var j = 0; j < 5; j++) out[j] = s[j] + dt * k[j] / h;
      return out;
    }
    function rk4(s) {
      var k1 = deriv(s), k2 = deriv(step(s, k1, 2));
      var k3 = deriv(step(s, k2, 2)), k4 = deriv(step(s, k3, 1));
      var out = new Array(5);
      for (var j = 0; j < 5; j++) out[j] = s[j] + dt * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6;
      return out;
    }
    var th = launchDeg * (Math.PI / 180);
    var state = [0, 0, ballSpeed * Math.cos(th), ballSpeed * Math.sin(th), spinRpm * 2 * Math.PI / 60];
    var apex = 0, t = 0, yd = cfg.yard_m;
    var points = every ? [[0, 0]] : null;
    var nSteps = Math.ceil(cfg.max_flight_s / dt);
    for (var i = 0; i < nSteps; i++) {
      var previous = state;
      state = rk4(state);
      t += dt;
      apex = Math.max(apex, state[1]);
      if (state[1] < 0) {
        var fraction = previous[1] / (previous[1] - state[1]);
        var landing = new Array(5);
        for (var j = 0; j < 5; j++) landing[j] = previous[j] + fraction * (state[j] - previous[j]);
        if (every) points.push([landing[0] / yd, 0]);
        var result = {
          ok: true,
          carry_yd: landing[0] / yd,
          apex_yd: apex / yd,
          flight_time_s: t - dt + fraction * dt,
          landing_speed_mps: Math.hypot(landing[2], landing[3]),
          landing_angle_deg_down: Math.atan2(-landing[3], landing[2]) * (180 / Math.PI),
        };
        if (every) result.points_yd = points;
        return result;
      }
      if (every && (i + 1) % every === 0) points.push([state[0] / yd, state[1] / yd]);
    }
    return fail("積分の上限までに着地しない");
  }

  function simulate(ballSpeed, launchDeg, spinRpm, config) {
    return fly(ballSpeed, launchDeg, spinRpm, config, 0);
  }

  function trajectory(ballSpeed, launchDeg, spinRpm, config, every) {
    var ev = every === undefined ? 25 : every;
    if (!(isNum(ev) && Math.floor(ev) === ev && ev >= 1)) return fail("every は 1 以上の整数");
    return fly(ballSpeed, launchDeg, spinRpm, config, ev);
  }

  function hsRatio(I, I2, n) {
    return Math.pow(I / I2, n);
  }

  function impactRatio(ballMassG, M, M2) {
    return (1 + ballMassG / M) / (1 + ballMassG / M2);
  }

  function whatIf(part, input, config) {
    if (!part || !["i_est_kgcm2", "length_cm", "total_mass_g", "balance_cm", "head_pos_cm", "head_mass_g", "b_pred_cm"]
      .every(function (k) { return isNum(part[k]); })) return fail("この番手は部品モデルが無い");
    if (!config || !isNum(config.mass_kg)) return fail("ボールの質量 (config の mass_kg) が無い");
    var R = input && input.arm_m;
    var armBad = armProblem(R);
    if (armBad) return fail(armBad);
    var model = input.model === undefined ? "I" : input.model;
    if (MODELS.indexOf(model) < 0) return fail("MOI の式は I (グリップ端) か J (肩まわり)");
    var mode = input && input.mode;
    if (mode !== "head" && mode !== "shaft") return fail("付ける場所を選んでね (ヘッド / シャフト・グリップ)");
    var dm = input.dm;
    if (!isNum(dm)) return fail("重さが数ではない");
    if (dm < -DM_LIMIT_G || dm > DM_LIMIT_G) return fail("重さは −100〜+100 g");
    var n = input.n === undefined ? N_CENTER : input.n;
    if (!isNum(n) || n <= 0) return fail("n が対応外");
    var L = part.length_cm;
    var r = mode === "head" ? part.head_pos_cm : input.r;
    if (!isNum(r)) return fail("位置が数ではない");
    if (r < 0) return fail("位置はグリップ端 (0 cm) より手前にできない");
    if (r > L) return fail("位置はクラブの長さ " + L.toFixed(1) + " cm まで");
    var mt = part.total_mass_g, B = part.balance_cm;
    if (!(mt + dm > 0)) return fail("総重量が 0 g 以下になる");
    var I = part.i_est_kgcm2;
    var dI = dm / 1000 * r * r;
    var I2 = I + dI;
    if (!(I2 > 0)) return fail("慣性モーメントの推定が 0 以下になる");
    var bp = part.b_pred_cm, mt2 = mt + dm, bp2 = (mt * bp + dm * r) / mt2;
    var J = hubJ(I, mt, bp, R), J2 = hubJ(I2, mt2, bp2, R);
    var hs = model === "I" ? hsFactor(L, L, I, I2, n, R) : hsFactor(L, L, J, J2, n, R);
    var ball = hs, M = null, M2 = null;
    if (mode === "head") {
      M = part.head_mass_g;
      M2 = M + dm;
      if (!(M2 > 0)) return fail("ヘッドの質量が 0 g 以下になる");
      ball = hs * impactRatio(config.mass_kg * 1000, M, M2);
    }
    return {
      ok: true, mode: mode, dm: dm, r: r, n: n, model: model, arm_m: R,
      i_before: I, i_after: I2, d_i: dI,
      j_before: J, j_after: J2,
      hs_ratio: hs, ball_ratio: ball,
      head_before_g: M, head_after_g: M2,
      b_before_cm: B, b_after_cm: (mt * B + dm * r) / mt2,
      bp_before_cm: bp, bp_after_cm: bp2,
      d_q14_gcm: dm * (r - PIVOT_14IN_CM),
    };
  }

  function whatIfBand(parts, input, config) {
    if (!Array.isArray(parts) || parts.length === 0) return fail("この番手は部品モデルが無い");
    var armBad = armProblem(input && input.arm_m);
    if (armBad) return fail(armBad);
    var ns = [N_CENTER].concat(N_BAND);
    var center = [], centerJ = [], all = [];
    for (var p = 0; p < parts.length; p++) {
      for (var a = 0; a < MODELS.length; a++) {
        for (var k = 0; k < ns.length; k++) {
          var res = whatIf(parts[p], { mode: input.mode, dm: input.dm, r: input.r, n: ns[k], arm_m: input.arm_m,
            model: MODELS[a] }, config);
          if (!res.ok) return res;
          all.push(res);
          if (k === 0 && MODELS[a] === "I") center.push(res);
          if (k === 0 && MODELS[a] === "J") centerJ.push(res);
        }
      }
    }
    function meanOver(list, key) {
      var s = 0;
      for (var j = 0; j < list.length; j++) s += list[j][key];
      return s / list.length;
    }
    function mean(key) { return meanOver(center, key); }
    function lo(key) { return Math.min.apply(null, all.map(function (x) { return x[key]; })); }
    function hi(key) { return Math.max.apply(null, all.map(function (x) { return x[key]; })); }
    return {
      ok: true, mode: input.mode, dm: input.dm, r: center[0].r, arm_m: input.arm_m, variants: center,
      hs_ratio: mean("hs_ratio"), hs_lo: lo("hs_ratio"), hs_hi: hi("hs_ratio"),
      ball_ratio: mean("ball_ratio"), ball_lo: lo("ball_ratio"), ball_hi: hi("ball_ratio"),
      ball_ratios: all.map(function (x) { return x.ball_ratio; }),
      hs_ratios: all.map(function (x) { return x.hs_ratio; }),
      hs_ratio_j: meanOver(centerJ, "hs_ratio"), ball_ratio_j: meanOver(centerJ, "ball_ratio"),
      i_before: mean("i_before"), i_after: mean("i_after"),
      j_before: meanOver(centerJ, "j_before"), j_after: meanOver(centerJ, "j_after"),
      b_before_cm: mean("b_before_cm"), b_after_cm: mean("b_after_cm"), d_q14_gcm: mean("d_q14_gcm"),
    };
  }

  function carryDelta(shot, ratio, ratios, config) {
    var before = simulate(shot.ball_speed, shot.launch, shot.spin, config);
    if (!before.ok) return fail(shot.shot_id + ": " + before.reason);
    var after = simulate(shot.ball_speed * ratio, shot.launch, shot.spin, config);
    if (!after.ok) return fail(shot.shot_id + " (替えた後): " + after.reason);
    var deltas = [];
    for (var k = 0; k < ratios.length; k++) {
      var x = simulate(shot.ball_speed * ratios[k], shot.launch, shot.spin, config);
      if (!x.ok) return fail(shot.shot_id + " (幅): " + x.reason);
      deltas.push(x.carry_yd - before.carry_yd);
    }
    return {
      ok: true, shot_id: shot.shot_id,
      carry_before: before.carry_yd, carry_after: after.carry_yd,
      delta: after.carry_yd - before.carry_yd,
      delta_lo: Math.min.apply(null, deltas.concat([after.carry_yd - before.carry_yd])),
      delta_hi: Math.max.apply(null, deltas.concat([after.carry_yd - before.carry_yd])),
    };
  }

  function selfCheck(data) {
    var T = data && data.trajectories;
    var cfg = T && T.model && T.model.config;
    if (!cfg) return { ok: false, checked: 0, failures: ["data.json に弾道の係数 (trajectories.model.config) が無い"] };
    var shots = (data.shots || []);
    var byId = {};
    for (var i = 0; i < shots.length; i++) byId[shots[i].shot_id] = shots[i];
    var rows = T.shots || [];
    var failures = [];
    for (var j = 0; j < rows.length; j++) {
      var t = rows[j], s = byId[t.shot_id];
      if (!s) { failures.push(t.shot_id + ": 記録が見つからない"); continue; }
      var res = simulate(s.ball_speed, s.launch, s.spin, cfg);
      if (!res.ok) { failures.push(t.shot_id + ": " + res.reason); continue; }
      var dc = Math.abs(res.carry_yd - t.carry), da = Math.abs(res.apex_yd - t.apex);
      if (!(dc <= SELF_CHECK_TOL_YD && da <= SELF_CHECK_TOL_YD)) {
        failures.push(t.shot_id + ": キャリー " + res.carry_yd.toFixed(2) + " (Python " + t.carry + ")・最高点 " +
          res.apex_yd.toFixed(2) + " (Python " + t.apex + ")");
      }
    }
    if (rows.length === 0) failures.push("data.json に軌跡が無い");
    return { ok: failures.length === 0, checked: rows.length, failures: failures };
  }

  var SW_POINT_OZIN = 1.75;
  var OZIN_GCM = 72.0;
  var SW_POINT_GCM = SW_POINT_OZIN * OZIN_GCM;
  var SW_PATTERN = /^([A-F])(\d|\d\.5)$/;
  var HS_N = [0.19, 0.25, 0.28];
  var HS_CENTER_N = 0.25;
  var EXTRAP_IN = 2;
  var SPIN_TANGENT_FACTOR = 2.5;
  var TANGENT_MASS_TERM = 3.5;
  var E_FIT_RANGE = [0.6, 0.95];
  var P_FIT_MAX_DEG = 10;
  var PARTS_SELF_CHECK_REL = 1e-9;
  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var CAND_LIMITS = [["loft_deg", 5, 64, "ロフト", "°"], ["length_in", 30, 48, "長さ", " in"],
    ["total_mass_g", 250, 500, "総重量", " g"], ["shaft_mass_g", 30, 130, "シャフト", " g"]];
  var PARTS_CONSTS = ["in_to_cm", "head_from_tip_cm", "shaft_short_cm", "grip_mass_g", "grip_pos_cm"];
  var PART_KEYS = ["shaft_len_cm", "head_mass_g", "head_pos_cm", "length_cm", "i_est_kgcm2", "b_pred_cm", "b_residual_cm"];

  function partsConstsProblem(consts) {
    if (!consts || typeof consts !== "object") return "部品モデルの定数 (swap.parts_model) が無い";
    for (var i = 0; i < PARTS_CONSTS.length; i++) {
      if (!isNum(consts[PARTS_CONSTS[i]])) return "部品モデルの定数 " + PARTS_CONSTS[i] + " が数ではない";
    }
    return null;
  }

  function partsAtLength(spec, lengthCm, consts) {
    var problem = partsConstsProblem(consts);
    if (problem) return fail(problem);
    var mt = spec && spec.total_mass_g, ms = spec && spec.shaft_mass_g, L = lengthCm;
    if (!(isNum(mt) && mt > 0)) return fail("総重量が正の数ではない");
    if (!(isNum(ms) && ms > 0)) return fail("シャフトの重さが正の数ではない");
    if (!(isNum(L) && L > 0)) return fail("長さが正の数ではない");
    var gm = consts.grip_mass_g, gp = consts.grip_pos_cm;
    var mh = mt - ms - gm;
    if (!(mh > 0)) return fail("ヘッドの質量 (総重量 − シャフト − グリップ " + gm + " g) が 0 g 以下になる");
    var xh = L - consts.head_from_tip_cm;
    var ls = L - consts.shaft_short_cm;
    if (!(ls > 0 && xh > 0)) return fail("シャフトの長さ (長さ − " + consts.shaft_short_cm + " cm) が 0 以下になる");
    var iEst = mh / 1000 * xh * xh + ms / 1000 * ls * ls / 3 + gm / 1000 * gp * gp;
    var bPred = (mh * xh + ms * ls / 2 + gm * gp) / mt;
    var out = {
      ok: true, shaft_mass_g: ms, shaft_len_cm: ls, head_mass_g: mh, head_pos_cm: xh,
      grip_mass_g: gm, grip_pos_cm: gp, length_cm: L, total_mass_g: mt, i_est_kgcm2: iEst, b_pred_cm: bPred,
    };
    if (spec.balance_cm !== undefined && spec.balance_cm !== null) {
      if (!isNum(spec.balance_cm)) return fail("バランス点が数ではない");
      out.balance_cm = spec.balance_cm;
      out.b_residual_cm = bPred - spec.balance_cm;
    }
    return out;
  }

  function partsModel(spec, consts) {
    var problem = partsConstsProblem(consts);
    if (problem) return fail(problem);
    var lin = spec && spec.length_in;
    if (!(isNum(lin) && lin > 0)) return fail("長さが正の数ではない");
    return partsAtLength(spec, lin * consts.in_to_cm, consts);
  }

  function parseSW(text) {
    if (typeof text !== "string") return fail("SW が文字ではない");
    var t = text.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).trim().toUpperCase();
    if (t === "") return fail("SW が空 (例 D2・D2.5・C9)");
    var m = SW_PATTERN.exec(t);
    if (!m) return fail("SW は A〜F の 1 文字と 0〜9 の数字 (.5 まで) — 例 D2・D2.5・C9 (入力 \"" + text + "\")");
    return { ok: true, sw: t, points: (m[1].charCodeAt(0) - 68) * 10 + Number(m[2]) };
  }

  function balanceFromSW(base, cand) {
    var pb = parseSW(base && base.sw);
    if (!pb.ok) return fail("土台の SW: " + pb.reason);
    var pc = parseSW(cand && cand.sw);
    if (!pc.ok) return fail("候補の SW: " + pc.reason);
    var mb = base.total_mass_g, bb = base.balance_cm, mc = cand.total_mass_g;
    if (!(isNum(mb) && mb > 0 && isNum(bb))) return fail("土台の総重量とバランス点が数ではない");
    if (!(isNum(mc) && mc > 0)) return fail("候補の総重量が正の数ではない");
    var q14b = mb * (bb - PIVOT_14IN_CM);
    var q14c = q14b + SW_POINT_GCM * (pc.points - pb.points);
    return {
      ok: true, sw_base: pb.sw, sw_cand: pc.sw, points_base: pb.points, points_cand: pc.points,
      q14_base_gcm: q14b, q14_cand_gcm: q14c, balance_cm: PIVOT_14IN_CM + q14c / mc,
    };
  }

  function checkCandidate(cand) {
    if (!cand || typeof cand !== "object") return fail("候補の仕様が無い");
    for (var i = 0; i < CAND_LIMITS.length; i++) {
      var k = CAND_LIMITS[i], v = cand[k[0]];
      if (!isNum(v)) return fail(k[3] + "が数ではない");
      if (v < k[1] || v > k[2]) return fail(k[3] + "は " + k[1] + "〜" + k[2] + k[4] + " (入力 " + v + ")");
    }
    var sw = parseSW(cand.sw);
    if (!sw.ok) return sw;
    return { ok: true, sw: sw.sw, points: sw.points };
  }

  function hsVariants(basePart, candPart, armM) {
    var ok = [basePart, candPart].every(function (p) {
      return p && isNum(p.i_est_kgcm2) && p.i_est_kgcm2 > 0 && isNum(p.length_cm) && p.length_cm > 0 &&
        isNum(p.total_mass_g) && p.total_mass_g > 0 && isNum(p.b_pred_cm);
    });
    if (!ok) return fail("HS の比に使う部品モデルが無い");
    var armBad = armProblem(armM);
    if (armBad) return fail(armBad);
    var X = {
      I: [basePart.i_est_kgcm2, candPart.i_est_kgcm2],
      J: [hubJ(basePart.i_est_kgcm2, basePart.total_mass_g, basePart.b_pred_cm, armM),
        hubJ(candPart.i_est_kgcm2, candPart.total_mass_g, candPart.b_pred_cm, armM)],
    };
    var variants = [], center = -1;
    for (var a = 0; a < MODELS.length; a++) {
      for (var b = 0; b < HS_N.length; b++) {
        var model = MODELS[a], n = HS_N[b];
        var ratio = hsFactor(basePart.length_cm, candPart.length_cm, X[model][0], X[model][1], n, armM);
        if (!(isNum(ratio) && ratio > 0)) return fail("HS の比が正の数にならない (" + model + "・n " + n + ")");
        if (model === "I" && n === HS_CENTER_N) center = variants.length;
        variants.push({ model: model, n: n, ratio: ratio });
      }
    }
    var rs = variants.map(function (v) { return v.ratio; });
    function pick(model) {
      for (var i = 0; i < variants.length; i++) if (variants[i].model === model && variants[i].n === HS_CENTER_N) return variants[i].ratio;
      return NaN;
    }
    return {
      ok: true, variants: variants, center_index: center, ratio: variants[center].ratio,
      lo: Math.min.apply(null, rs), hi: Math.max.apply(null, rs), ratio_i: pick("I"), ratio_j: pick("J"),
      j_base: X.J[0], j_cand: X.J[1], arm_m: armM,
    };
  }

  function ballProblem(config) {
    if (!config || !(isNum(config.mass_kg) && config.mass_kg > 0) || !(isNum(config.radius_m) && config.radius_m > 0)) {
      return "ボールの質量と半径 (config の mass_kg・radius_m) が正の数ではない";
    }
    return null;
  }

  function invertShot(shot, base, config) {
    var problem = ballProblem(config);
    if (problem) return fail(problem);
    var V = shot && shot.club_speed, v = shot && shot.ball_speed, rpm = shot && shot.spin, lamDeg = shot && shot.launch;
    var M = base && base.head_mass_g, loft = base && base.loft_deg;
    if (!(isNum(V) && V > 0)) return fail("ヘッドスピードが正の数ではない");
    if (!(isNum(v) && v > 0)) return fail("ボールスピードが正の数ではない");
    if (!(isNum(rpm) && rpm >= 0)) return fail("スピンが 0 以上の数ではない");
    if (!isNum(lamDeg)) return fail("打出角が数ではない");
    if (!(isNum(M) && M > 0)) return fail("土台のヘッドの質量が正の数ではない");
    if (!isNum(loft)) return fail("土台のロフトが数ではない");
    var m = config.mass_kg * 1000, r = config.radius_m;
    var w = rpm * 2 * Math.PI / 60;
    var vp = w * r / SPIN_TANGENT_FACTOR;
    var a = vp * (TANGENT_MASS_TERM + m / M) / V;
    if (!(a >= 0 && a < 1)) return fail("a = " + a.toFixed(3) + " が 0 以上 1 未満の外 (スピンに比べて HS が遅すぎる)");
    if (!(v > vp)) return fail("ボールスピードが接線方向の速さ v_p (" + vp.toFixed(2) + " m/s) 以下");
    var th = Math.asin(a);
    var vn = Math.sqrt(v * v - vp * vp);
    var e = vn * (1 + m / M) / (V * Math.cos(th)) - 1;
    if (!(e >= E_FIT_RANGE[0] && e <= E_FIT_RANGE[1])) {
      return fail("当てはめの e = " + e.toFixed(3) + " が " + E_FIT_RANGE[0] + "〜" + E_FIT_RANGE[1] + " の外 (運用上の採用範囲)");
    }
    var p = lamDeg * DEG - (th - Math.atan(vp / vn));
    if (!(Math.abs(p) <= P_FIT_MAX_DEG * DEG)) {
      return fail("当てはめの p = " + (p * RAD).toFixed(1) + "° が ±" + P_FIT_MAX_DEG + "° の外 (運用上の採用範囲)");
    }
    var d = th + p - loft * DEG;
    return {
      ok: true, a: a, v_p: vp, v_n: vn, theta: th, e: e, p: p, delta: d,
      theta_deg: th * RAD, p_deg: p * RAD, delta_deg: d * RAD,
    };
  }

  function forwardShot(inv, cand, config) {
    var problem = ballProblem(config);
    if (problem) return fail(problem);
    if (!inv || !isNum(inv.theta) || !isNum(inv.e) || !isNum(inv.p)) return fail("逆算の値が無い");
    var V2 = cand && cand.club_speed, M2 = cand && cand.head_mass_g;
    if (!(isNum(V2) && V2 > 0)) return fail("替えた後のヘッドスピードが正の数ではない");
    if (!(isNum(M2) && M2 > 0)) return fail("候補のヘッドの質量が正の数ではない");
    if (!(isNum(cand.loft_deg) && isNum(cand.base_loft_deg))) return fail("ロフトが数ではない");
    var m = config.mass_kg * 1000, r = config.radius_m;
    var th2 = inv.theta + (cand.loft_deg - cand.base_loft_deg) * DEG;
    if (!(th2 > 0 && th2 < Math.PI / 2)) return fail("θ' = " + (th2 * RAD).toFixed(1) + "° が 0〜90° の外 (ロフトの差が大きすぎる)");
    var vp2 = V2 * Math.sin(th2) / (TANGENT_MASS_TERM + m / M2);
    var vn2 = (1 + inv.e) * V2 * Math.cos(th2) / (1 + m / M2);
    var bs = Math.sqrt(vn2 * vn2 + vp2 * vp2);
    var w2 = SPIN_TANGENT_FACTOR * vp2 / r;
    var spin = w2 * 60 / (2 * Math.PI);
    var la = inv.p + th2 - Math.atan(vp2 / vn2);
    var laDeg = la * RAD;
    if (!(isNum(spin) && spin > 0)) return fail("替えた後のスピンが 0 rpm 以下");
    if (!(isNum(laDeg) && laDeg > 0)) return fail("替えた後の打出角 " + (isNum(laDeg) ? laDeg.toFixed(1) : "?") + "° が 0° 以下");
    if (![vp2, vn2, bs].every(isNum)) return fail("替えた後の値が有限の数にならない");
    return { ok: true, theta2: th2, theta2_deg: th2 * RAD, v_p: vp2, v_n: vn2, ball_speed: bs, spin: spin, launch: laDeg };
  }

  function meanOf(list, f) {
    var s = 0;
    for (var i = 0; i < list.length; i++) s += f(list[i]);
    return s / list.length;
  }

  function parseSwing(swing) {
    if (swing === undefined || swing === null) return { ok: true, kind: "none", k: null, target_mps: null };
    if (typeof swing !== "object") return fail("振りの指定は { k } か { target_mps } のどちらか 1 つ");
    var hasK = swing.k !== undefined && swing.k !== null;
    var hasT = swing.target_mps !== undefined && swing.target_mps !== null;
    if (hasK === hasT) return fail("振りの指定は { k } か { target_mps } のどちらか 1 つ");
    if (hasK) {
      if (!(isNum(swing.k) && swing.k > 0)) return fail("振りの倍率 k が正の数ではない");
      return { ok: true, kind: "k", k: swing.k, target_mps: null };
    }
    if (!(isNum(swing.target_mps) && swing.target_mps > 0)) return fail("そろえる先の HS (target_mps) が正の数ではない");
    return { ok: true, kind: "target", k: null, target_mps: swing.target_mps };
  }

  function swapClub(base, cand, consts, config, armM, swing) {
    var club = base && base.club;
    if (!club || typeof club !== "object") return fail("土台の番手を選んでね");
    if (!Array.isArray(club.parts) || club.parts.length !== 1) {
      return fail("土台に選べるのは部品モデルが 1 つの番手だけ (" + club.club + ")");
    }
    if (!(isNum(club.loft_deg) && isNum(club.length_in))) return fail("土台のロフトと長さが数ではない");
    var problem = configProblem(config);
    if (problem) return fail(problem);
    var armBad = armProblem(armM);
    if (armBad) return fail(armBad);
    var sg = parseSwing(swing);
    if (!sg.ok) return sg;
    var bp = club.parts[0];
    var chk = checkCandidate(cand);
    if (!chk.ok) return chk;
    var bal = balanceFromSW({ total_mass_g: club.total_mass_g, balance_cm: club.balance_from_butt_cm, sw: club.sw_reported }, cand);
    if (!bal.ok) return bal;
    var cp = partsModel({ total_mass_g: cand.total_mass_g, shaft_mass_g: cand.shaft_mass_g, length_in: cand.length_in,
      balance_cm: bal.balance_cm }, consts);
    if (!cp.ok) return fail("候補の部品モデル: " + cp.reason);
    var hs = hsVariants(bp, cp, armM);
    if (!hs.ok) return hs;
    hs.d_length_in = cand.length_in - club.length_in;
    hs.extrapolated = Math.abs(hs.d_length_in) > EXTRAP_IN;
    var shots = Array.isArray(base.shots) ? base.shots : [];
    var speeds = function (V) {
      if (sg.kind === "target") return [{ model: null, n: null, club_speed: sg.target_mps }];
      return hs.variants.map(function (v) {
        return { model: v.model, n: v.n, club_speed: sg.kind === "k" ? V * v.ratio * sg.k : V * v.ratio };
      });
    };
    var centerIdx = sg.kind === "target" ? 0 : hs.center_index;
    var rows = [], excluded = [];
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i], id = String(s && s.shot_id);
      var inv = invertShot(s, { loft_deg: club.loft_deg, head_mass_g: bp.head_mass_g }, config);
      if (!inv.ok) { excluded.push({ shot_id: id, stage: "inverse", reason: "逆算が範囲外: " + inv.reason }); continue; }
      var b0 = simulate(s.ball_speed, s.launch, s.spin, config);
      if (!b0.ok) { excluded.push({ shot_id: id, stage: "base", reason: "土台の弾道が範囲外: " + b0.reason }); continue; }
      var vs = [], bad = null, plan = speeds(s.club_speed);
      for (var k = 0; k < plan.length && !bad; k++) {
        var f = forwardShot(inv, { club_speed: plan[k].club_speed, head_mass_g: cp.head_mass_g,
          loft_deg: cand.loft_deg, base_loft_deg: club.loft_deg }, config);
        if (!f.ok) { bad = f.reason; break; }
        var fl = simulate(f.ball_speed, f.launch, f.spin, config);
        if (!fl.ok) { bad = fl.reason; break; }
        vs.push({ model: plan[k].model, n: plan[k].n, club_speed: plan[k].club_speed,
          ball_speed: f.ball_speed, spin: f.spin, launch: f.launch, carry: fl.carry_yd, apex: fl.apex_yd,
          carry_delta: fl.carry_yd - b0.carry_yd });
      }
      if (bad) { excluded.push({ shot_id: id, stage: "forward", reason: "替えた後が範囲外: " + bad }); continue; }
      var c = vs[centerIdx];
      var row = {
        shot_id: id,
        fit: { a: inv.a, theta_deg: inv.theta_deg, e: inv.e, p_deg: inv.p_deg, delta_deg: inv.delta_deg },
        before: { club_speed: s.club_speed, ball_speed: s.ball_speed, spin: s.spin, launch: s.launch,
          carry: b0.carry_yd, apex: b0.apex_yd },
        after: { club_speed: c.club_speed, ball_speed: c.ball_speed, spin: c.spin, launch: c.launch,
          carry: c.carry, apex: c.apex },
        carry_delta: c.carry_delta, variants: vs,
      };
      ["club_speed", "ball_speed", "spin", "launch", "carry_delta"].forEach(function (key) {
        var xs = vs.map(function (x) { return x[key]; });
        row[key + "_lo"] = Math.min.apply(null, xs);
        row[key + "_hi"] = Math.max.apply(null, xs);
      });
      rows.push(row);
    }
    if (rows.length === 0) {
      return { ok: false, all_excluded: true, reason: "この候補は、土台の球ではどれも計算できない", excluded: excluded };
    }
    var mean = { before: {}, after: {} };
    ["club_speed", "ball_speed", "spin", "launch", "carry"].forEach(function (key) {
      mean.before[key] = meanOf(rows, function (r) { return r.before[key]; });
      mean.after[key] = meanOf(rows, function (r) { return r.after[key]; });
    });
    ["club_speed", "ball_speed", "spin", "launch", "carry_delta"].forEach(function (key) {
      mean[key + "_lo"] = meanOf(rows, function (r) { return r[key + "_lo"]; });
      mean[key + "_hi"] = meanOf(rows, function (r) { return r[key + "_hi"]; });
    });
    mean.carry_delta = meanOf(rows, function (r) { return r.carry_delta; });
    var out = {
      ok: true, base_club: String(club.club), sw: chk.sw, balance: bal, base_part: bp, cand_part: cp,
      hs: hs, rows: rows, excluded: excluded, mean: mean,
    };
    if (sg.kind !== "none") out.swing = { kind: sg.kind, k: sg.k, target_mps: sg.target_mps };
    return out;
  }

  function tourCheck(tour, spec, config) {
    if (!Array.isArray(tour) || !spec || !spec.clubs || !Array.isArray(spec.targets) || !isNum(spec.mph_to_mps)) {
      return fail("答え合わせの仮定 (swap.tour_check) が無い");
    }
    var k = spec.mph_to_mps, bc = spec.clubs[spec.base];
    if (!bc) return fail("答え合わせの土台 (" + spec.base + ") の仮定が無い");
    var names = [];
    tour.forEach(function (t) { if (names.indexOf(t.tour) < 0) names.push(t.tour); });
    var rows = [];
    names.forEach(function (name) {
      function find(tc) {
        for (var i = 0; i < tour.length; i++) if (tour[i].tour === name && tour[i].tour_club === tc) return tour[i];
        return null;
      }
      var b = find(spec.base);
      if (!b) return;
      var inv = invertShot({ club_speed: b.club_speed_mph * k, ball_speed: b.ball_speed_mph * k, spin: b.spin, launch: b.launch },
        { loft_deg: bc.loft_deg, head_mass_g: bc.head_mass_g }, config);
      spec.targets.forEach(function (tc) {
        var t = find(tc), c = spec.clubs[tc];
        if (!t || !c) return;
        var head = { tour: name, tour_club: tc, loft_deg: c.loft_deg, head_mass_g: c.head_mass_g, year: String(t.year || "") };
        if (!inv.ok) { rows.push(Object.assign(head, { ok: false, reason: "逆算が範囲外: " + inv.reason })); return; }
        var f = forwardShot(inv, { club_speed: t.club_speed_mph * k, head_mass_g: c.head_mass_g, loft_deg: c.loft_deg,
          base_loft_deg: bc.loft_deg }, config);
        if (!f.ok) { rows.push(Object.assign(head, { ok: false, reason: "前向きが範囲外: " + f.reason })); return; }
        rows.push(Object.assign(head, {
          ok: true, fit: { e: inv.e, p_deg: inv.p_deg, theta_deg: inv.theta_deg },
          pred: { ball_speed_mph: f.ball_speed / k, spin: f.spin, launch: f.launch },
          meas: { ball_speed_mph: t.ball_speed_mph, spin: t.spin, launch: t.launch },
        }));
      });
    });
    return { ok: true, rows: rows };
  }

  function partsSelfCheck(data) {
    var consts = data && data.swap && data.swap.parts_model;
    if (partsConstsProblem(consts)) return { ok: false, checked: 0, failures: [partsConstsProblem(consts)] };
    var clubs = (data && data.clubs) || [], failures = [], checked = 0;
    for (var i = 0; i < clubs.length; i++) {
      var c = clubs[i], parts = c.parts || [];
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        var js = partsModel({ total_mass_g: c.total_mass_g, shaft_mass_g: p.shaft_mass_g, length_in: c.length_in,
          balance_cm: c.balance_from_butt_cm }, consts);
        if (!js.ok) { failures.push(c.club + ": " + js.reason); continue; }
        checked++;
        for (var q = 0; q < PART_KEYS.length; q++) {
          var key = PART_KEYS[q], x = js[key], y = p[key];
          if (!(isNum(y) && Math.abs(x - y) <= PARTS_SELF_CHECK_REL * Math.max(Math.abs(x), Math.abs(y)) + 1e-12)) {
            failures.push(c.club + " (シャフト " + p.shaft_mass_g + " g) の " + key + ": JS " + x + " / Python " + y);
          }
        }
      }
    }
    if (checked === 0 && failures.length === 0) failures.push("data.json に部品モデルが無い");
    return { ok: failures.length === 0, checked: checked, failures: failures };
  }

  var HS_FLAG_PREFIX = "hs_";
  var NO_REVIEW_FLAG = "review_not_required";
  var G_PER_KG = 1000;
  var PERCENT = 100;
  var SWING_PCT_LIMITS = [-20, 30];
  var TOURS = { pga: "PGA Tour", lpga: "LPGA Tour" };
  var CAND_TOUR_CLUB = { "3W": "3-wood" };
  var CAND_SPEC_KEYS = ["loft_deg", "length_in", "total_mass_g", "sw", "shaft_mass_g"];
  var CHANGE_KINDS = ["none", "weight", "swap"];
  var SWING_KINDS = ["none", "pct", "pga", "lpga"];
  var SHOT_KEYS = ["club_speed", "ball_speed", "spin", "launch", "carry", "apex"];

  function hsFlagged(shot) {
    var f = shot && typeof shot === "object" ? shot.review_flag : null;
    return typeof f === "string" && f.indexOf(HS_FLAG_PREFIX) === 0;
  }

  function anyFlag(shot) {
    var f = shot && typeof shot === "object" ? shot.review_flag : null;
    return typeof f === "string" && f !== "" && f !== NO_REVIEW_FLAG;
  }

  function tangentRatio(ballMassG, M, M2) {
    return (TANGENT_MASS_TERM + ballMassG / M) / (TANGENT_MASS_TERM + ballMassG / M2);
  }

  function sameClubShot(shot, ch, config) {
    if (!config || !(isNum(config.mass_kg) && config.mass_kg > 0)) return fail("ボールの質量 (config の mass_kg) が無い");
    var h = ch && ch.h, M = ch && ch.M, M2 = ch && ch.M2;
    if (!(isNum(h) && h > 0)) return fail("HS の比 h が正の数ではない");
    if (!(isNum(M) && M > 0 && isNum(M2) && M2 > 0)) return fail("ヘッドの質量 (前 M・後 M2) が正の数ではない");
    var v = shot && shot.ball_speed, rpm = shot && shot.spin, la = shot && shot.launch;
    if (!(isNum(v) && isNum(rpm) && isNum(la))) return fail("球のボールスピード・スピン・打出角が数ではない");
    var m = config.mass_kg * G_PER_KG;
    var rb = h * impactRatio(m, M, M2), rs = h * tangentRatio(m, M, M2);
    var bs = v * rb, spin = rpm * rs;
    var bad = flightInputProblem(bs, la, spin);
    if (bad) return fail("弾道の入力範囲の外: " + bad);
    return { ok: true, ball_speed: bs, spin: spin, launch: la, ratio_ball: rb, ratio_spin: rs };
  }

  function findClub(data, name) {
    for (var i = 0; i < data.clubs.length; i++) if (data.clubs[i] && data.clubs[i].club === name) return data.clubs[i];
    return null;
  }

  function candidateKind(data, cand) {
    var list = data.swap && Array.isArray(data.swap.candidates) ? data.swap.candidates : [];
    var id = cand && typeof cand === "object" ? cand.id : undefined;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (id === undefined || id === null || !c || c.id !== id) continue;
      var same = CAND_SPEC_KEYS.every(function (key) {
        if (key === "sw") {
          var a = parseSW(cand.sw), b = parseSW(c.sw);
          return a.ok && b.ok && a.sw === b.sw;
        }
        return isNum(cand[key]) && cand[key] === c[key];
      });
      if (same) {
        var tc = Object.prototype.hasOwnProperty.call(CAND_TOUR_CLUB, c.id) ? CAND_TOUR_CLUB[c.id] : null;
        return { kind: "catalog", id: c.id, tour_club: tc };
      }
    }
    return { kind: "manual", id: null, tour_club: null };
  }

  function tourRow(data, key, field, value) {
    if (value === undefined || value === null) return null;
    var tour = Array.isArray(data.tour) ? data.tour : [];
    for (var i = 0; i < tour.length; i++) {
      var t = tour[i];
      if (t && t.tour === TOURS[key] && t[field] === value && isNum(t.club_speed) && t.club_speed > 0) return t;
    }
    return null;
  }

  function swapBaseProblem(club, shots, config) {
    var why = [];
    var parts = Array.isArray(club.parts) ? club.parts : [];
    if (shots.length === 0) why.push("記録が無い");
    if (parts.length === 0) why.push("部品モデルが無い");
    else if (parts.length !== 1) why.push("部品モデルが " + parts.length + " つ (シャフトの仮定が " + parts.length + " 通り)");
    if (why.length === 0) {
      var base = { loft_deg: club.loft_deg, head_mass_g: parts[0].head_mass_g }, any = false;
      for (var i = 0; i < shots.length && !any; i++) any = invertShot(shots[i], base, config).ok;
      if (!any) why.push("逆算できる球が無い — 当てはめの値が採用範囲の外");
    }
    return why.length ? "土台に選べない番手 (" + why.join("・") + ")" : null;
  }

  function simPlan(data, state) {
    if (!data || typeof data !== "object" || !Array.isArray(data.clubs) || !Array.isArray(data.shots)) {
      return fail("data.json の番手 (clubs) と記録 (shots) が無い");
    }
    var cfg = data.trajectories && data.trajectories.model && data.trajectories.model.config;
    var cfgBad = configProblem(cfg);
    if (cfgBad) return fail(cfgBad);
    if (!state || typeof state !== "object") return fail("画面の状態 (state) が無い");
    var club = findClub(data, state.club);
    if (!club) return fail("番手を選んでね (" + state.club + " は data.json に無い)");
    var change = state.change, swing = state.swing;
    if (!change || typeof change !== "object" || CHANGE_KINDS.indexOf(change.kind) < 0) {
      return fail("クラブの変え方 (change.kind) は none / weight / swap");
    }
    if (!swing || typeof swing !== "object" || SWING_KINDS.indexOf(swing.kind) < 0) {
      return fail("振り (swing.kind) は none / pct / pga / lpga");
    }
    var include = state.includeHsFlag === true;
    var align = swing.kind === "pga" || swing.kind === "lpga";
    var R = armFromBody(data.profile).R_m;
    var parts = Array.isArray(club.parts) ? club.parts : [];
    var shots = data.shots.filter(function (s) { return s && s.club === club.club; });
    var path = change.kind === "swap" ? "swap" : change.kind === "none" && swing.kind === "none" ? "none" : "same";

    var noRec = shots.length ? null : "記録が無い番手 (" + club.club + ")";
    var cand = change.kind === "swap" ? candidateKind(data, change.cand) : null;
    var disabled = { weight: parts.length ? null : "部品モデルが無い番手 (" + club.club + ")",
      swap: swapBaseProblem(club, shots, cfg), pct: noRec, pga: null, lpga: null };
    var targets = {};
    ["pga", "lpga"].forEach(function (key) {
      var row = cand ? tourRow(data, key, "tour_club", cand.tour_club) : tourRow(data, key, "club", club.club);
      targets[key] = row;
      var tourWhy = row ? null : cand ? "ツアーの平均が無い候補 (" + (cand.kind === "manual" ? "手入力" : cand.id) + ")"
        : "ツアーの平均が無い番手";
      var why = [noRec, tourWhy].filter(Boolean);
      disabled[key] = why.length ? why.join("・") : null;
    });

    var bases = [];
    var rows = shots.map(function (s) {
      var b = simulate(s.ball_speed, s.launch, s.spin, cfg);
      bases.push(b);
      return {
        shot_id: String(s.shot_id), review_flag: s.review_flag === undefined ? null : s.review_flag,
        flagged: anyFlag(s), hs_flagged: hsFlagged(s), adopted: false, stage: null, reason: null,
        before: { club_speed: s.club_speed, ball_speed: s.ball_speed, spin: s.spin, launch: s.launch,
          carry: b.ok ? b.carry_yd : null, apex: b.ok ? b.apex_yd : null },
        after: null, lo: null, hi: null, ratio_hs: null, ratio_ball: null, ratio_spin: null,
        carry_delta: null, carry_delta_lo: null, carry_delta_hi: null, fit: null,
      };
    });
    var plan = {
      ok: true, club: String(club.club), path: path, changed: path !== "none", change: change.kind, swing: swing.kind,
      include_hs_flag: include, hs_rule: path === "none" ? "none" : align ? "target" : "ratio", k: null, target: null,
      band: path !== "none" && change.kind !== "none" && !align, percent_only: false, arm_m: R, cand: cand,
      disabled: disabled, blocked: null, blocked_kind: null,
      shots: rows, excluded: [], n_shots: rows.length, n_adopted: 0, n_excluded: 0, mean: null, weight: null, swap: null,
    };

    function exclude(r, stage, reason) { r.stage = stage; r.reason = reason; }
    function adopt(r, after, vals, ratios) {
      r.adopted = true;
      r.after = after;
      r.lo = {};
      r.hi = {};
      SHOT_KEYS.forEach(function (key) {
        var xs = vals.map(function (v) { return v[key]; });
        var all = xs.every(isNum);
        r.lo[key] = all ? Math.min.apply(null, xs) : null;
        r.hi[key] = all ? Math.max.apply(null, xs) : null;
      });
      r.carry_delta = after.carry - r.before.carry;
      r.carry_delta_lo = r.lo.carry - r.before.carry;
      r.carry_delta_hi = r.hi.carry - r.before.carry;
      r.ratio_hs = ratios.hs;
      r.ratio_ball = ratios.ball;
      r.ratio_spin = ratios.spin;
    }
    function finish() {
      plan.excluded = rows.filter(function (r) { return r.stage; })
        .map(function (r) { return { shot_id: r.shot_id, stage: r.stage, reason: r.reason }; });
      var ad = rows.filter(function (r) { return r.adopted; });
      plan.n_adopted = ad.length;
      plan.n_excluded = plan.excluded.length;
      if (!ad.length) return plan;
      var m = { n: ad.length, before: {}, after: {}, delta: {}, lo: {}, hi: {}, delta_lo: {}, delta_hi: {} };
      SHOT_KEYS.forEach(function (key) {
        var has = ad.filter(function (r) { return isNum(r.before[key]) && isNum(r.after[key]); });
        var avg = function (f) { return has.length ? meanOf(has, f) : null; };
        m.before[key] = avg(function (r) { return r.before[key]; });
        m.after[key] = avg(function (r) { return r.after[key]; });
        m.delta[key] = avg(function (r) { return r.after[key] - r.before[key]; });
        m.lo[key] = avg(function (r) { return r.lo[key]; });
        m.hi[key] = avg(function (r) { return r.hi[key]; });
        m.delta_lo[key] = avg(function (r) { return r.lo[key] - r.before[key]; });
        m.delta_hi[key] = avg(function (r) { return r.hi[key] - r.before[key]; });
      });
      m.carry_delta = m.delta.carry;
      m.carry_delta_lo = m.delta_lo.carry;
      m.carry_delta_hi = m.delta_hi.carry;
      plan.mean = m;
      return plan;
    }
    function block(kind, reason) {
      rows.forEach(function (r) {
        if (!r.adopted) return;
        r.adopted = false;
        r.after = r.lo = r.hi = r.ratio_hs = r.ratio_ball = r.ratio_spin = null;
        r.carry_delta = r.carry_delta_lo = r.carry_delta_hi = r.fit = null;
      });
      plan.blocked = reason;
      plan.blocked_kind = kind;
      return finish();
    }

    if (path === "none") return finish();
    if (change.kind !== "none" && disabled[change.kind]) return block("disabled", disabled[change.kind]);
    if (swing.kind !== "none" && disabled[swing.kind]) return block("disabled", disabled[swing.kind]);
    if (swing.kind === "pct") {
      var x = swing.x;
      if (!isNum(x)) return block("range", "x% が数ではない");
      if (x < SWING_PCT_LIMITS[0] || x > SWING_PCT_LIMITS[1]) {
        return block("range", "x% は −" + Math.abs(SWING_PCT_LIMITS[0]) + "〜+" + SWING_PCT_LIMITS[1] + "% (入力 " + x + ")");
      }
      plan.k = 1 + x / PERCENT;
    }
    if (align) {
      var t = targets[swing.kind];
      plan.target = { tour: t.tour, tour_club: t.tour_club, club: t.club, club_speed: t.club_speed };
    }
    rows.forEach(function (r, i) {
      if (!bases[i].ok) exclude(r, "base", "今の弾道が範囲外: " + bases[i].reason);
      else if (align && !include && r.hs_flagged) {
        exclude(r, "hs_flag", "HS が要確認の球 (" + r.review_flag + ") — そろえる時は既定で外す (「含める」で入る)");
      }
    });

    if (path === "same") {
      if (!parts.length || !(isNum(parts[0].head_mass_g) && parts[0].head_mass_g > 0)) {
        return block("range", "部品モデル (ヘッドの質量) が無い番手 (" + club.club + ")");
      }
      var perPart;
      if (change.kind === "weight") {
        var input = { mode: change.mode, dm: change.dm, r: change.r, arm_m: R };
        var wb = whatIfBand(parts, input, cfg);
        plan.weight = wb;
        if (!wb.ok) return block("range", wb.reason);
        if (!shots.length) {
          plan.percent_only = true;
          return finish();
        }
        perPart = parts.map(function (p) {
          var one = whatIfBand([p], input, cfg);
          return { M: p.head_mass_g, M2: change.mode === "head" ? p.head_mass_g + change.dm : p.head_mass_g,
            center: one.hs_ratio, ratios: one.hs_ratios };
        });
      } else {
        perPart = [{ M: parts[0].head_mass_g, M2: parts[0].head_mass_g, center: 1, ratios: [] }];
      }
      var kOf = function (f) { return plan.k === null ? f : f * plan.k; };
      rows.forEach(function (r, i) {
        if (r.stage) return;
        var s = shots[i], centers, variants = [];
        if (align) {
          if (!(isNum(s.club_speed) && s.club_speed > 0)) { exclude(r, "same", "記録の HS が正の数ではない"); return; }
          var hT = plan.target.club_speed / s.club_speed;
          centers = perPart.map(function (p) { return { h: hT, M: p.M, M2: p.M2 }; });
        } else {
          centers = perPart.map(function (p) { return { h: kOf(p.center), M: p.M, M2: p.M2 }; });
          perPart.forEach(function (p) {
            p.ratios.forEach(function (q) { variants.push({ h: kOf(q), M: p.M, M2: p.M2 }); });
          });
        }
        var cs = centers.map(function (c) { return sameClubShot(s, c, cfg); });
        for (var j = 0; j < cs.length; j++) if (!cs[j].ok) { exclude(r, "same", "変えた後が範囲外: " + cs[j].reason); return; }
        var ball = meanOf(cs, function (c) { return c.ball_speed; }), spin = meanOf(cs, function (c) { return c.spin; });
        var fl = simulate(ball, s.launch, spin, cfg);
        if (!fl.ok) { exclude(r, "same", "変えた後が範囲外: " + fl.reason); return; }
        var hC = meanOf(centers, function (c) { return c.h; });
        var hasHs = isNum(s.club_speed);
        var after = { club_speed: align ? plan.target.club_speed : hasHs ? s.club_speed * hC : null, ball_speed: ball, spin: spin,
          launch: s.launch, carry: fl.carry_yd, apex: fl.apex_yd };
        var vals = [after];
        for (var q = 0; q < variants.length; q++) {
          var vr = sameClubShot(s, variants[q], cfg);
          if (!vr.ok) { exclude(r, "same", "変えた後 (幅) が範囲外: " + vr.reason); return; }
          var fv = simulate(vr.ball_speed, vr.launch, vr.spin, cfg);
          if (!fv.ok) { exclude(r, "same", "変えた後 (幅) が範囲外: " + fv.reason); return; }
          vals.push({ club_speed: hasHs ? s.club_speed * variants[q].h : null, ball_speed: vr.ball_speed, spin: vr.spin, launch: vr.launch,
            carry: fv.carry_yd, apex: fv.apex_yd });
        }
        adopt(r, after, vals, { hs: hasHs ? hC : null, ball: meanOf(cs, function (c) { return c.ratio_ball; }),
          spin: meanOf(cs, function (c) { return c.ratio_spin; }) });
      });
    } else {
      var use = shots.filter(function (s, i) { return !rows[i].stage; });
      if (!use.length) return block("all_excluded", "変えた後に使える球が無い (外した球は一覧)");
      var swingArg = plan.k !== null ? { k: plan.k } : align ? { target_mps: plan.target.club_speed } : undefined;
      var res = swapClub({ club: club, shots: use }, change.cand, data.swap && data.swap.parts_model, cfg, R, swingArg);
      plan.swap = res;
      if (!res.ok && !res.all_excluded) return block("range", res.reason);
      var exById = {}, rowById = {};
      (res.excluded || []).forEach(function (x) { exById[x.shot_id] = x; });
      (res.rows || []).forEach(function (x) { rowById[x.shot_id] = x; });
      rows.forEach(function (r) {
        if (r.stage) return;
        var ex = exById[r.shot_id], w = rowById[r.shot_id];
        if (ex) { exclude(r, ex.stage, ex.reason); return; }
        if (!w) { exclude(r, "forward", "替えた後の結果が無い"); return; }
        var after = {};
        SHOT_KEYS.forEach(function (key) { after[key] = w.after[key]; });
        adopt(r, after, [w.after].concat(w.variants), { hs: w.after.club_speed / r.before.club_speed,
          ball: w.after.ball_speed / r.before.ball_speed, spin: w.after.spin / r.before.spin });
        r.fit = w.fit;
      });
      if (!res.ok) return block("all_excluded", res.reason);
    }
    if (!rows.some(function (r) { return r.adopted; })) {
      return block("all_excluded", "変えた後に使える球が無い (外した球は一覧)");
    }
    return finish();
  }

  return Object.freeze({
    N_CENTER: N_CENTER, N_BAND: N_BAND.slice(), DM_LIMIT_G: DM_LIMIT_G, PIVOT_14IN_CM: PIVOT_14IN_CM,
    SELF_CHECK_TOL_YD: SELF_CHECK_TOL_YD,
    simulate: simulate, trajectory: trajectory,
    hsRatio: hsRatio, impactRatio: impactRatio, whatIf: whatIf, whatIfBand: whatIfBand,
    carryDelta: carryDelta, selfCheck: selfCheck,
    ARM_MASS_KG: ARM_MASS_KG, ARM_CG_M: ARM_CG_M, ARM_ICM: ARM_ICM, ARM_I_HUB: ARM_I_HUB, ARM_DEFAULT_M: ARM_DEFAULT_M,
    DC: Object.freeze(Object.assign({}, DC)), MODELS: MODELS.slice(),
    hubJ: hubJ, hsFactor: hsFactor, armFromBody: armFromBody,
    SW_POINT_GCM: SW_POINT_GCM, HS_N: HS_N.slice(), EXTRAP_IN: EXTRAP_IN,
    E_FIT_RANGE: E_FIT_RANGE.slice(), P_FIT_MAX_DEG: P_FIT_MAX_DEG,
    CAND_LIMITS: CAND_LIMITS.map(function (x) { return x.slice(); }),
    partsModel: partsModel, partsAtLength: partsAtLength, parseSW: parseSW, balanceFromSW: balanceFromSW,
    checkCandidate: checkCandidate, hsVariants: hsVariants, invertShot: invertShot, forwardShot: forwardShot,
    swapClub: swapClub, tourCheck: tourCheck, partsSelfCheck: partsSelfCheck,
    TANGENT_MASS_TERM: TANGENT_MASS_TERM, SWING_PCT_LIMITS: SWING_PCT_LIMITS.slice(),
    TOURS: Object.freeze(Object.assign({}, TOURS)), CAND_TOUR_CLUB: Object.freeze(Object.assign({}, CAND_TOUR_CLUB)),
    hsFlagged: hsFlagged, tangentRatio: tangentRatio, sameClubShot: sameClubShot, simPlan: simPlan,
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = GolfPhysics;
