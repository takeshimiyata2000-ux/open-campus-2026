// ドッキングラボ（試作版）: 手動ドッキングの画面と操作。
// スコア計算と分子の幾何は scoring.js（DockScoring）にある。
(function () {
  "use strict";

  const S = window.DockScoring;
  const $ = (id) => document.getElementById(id);

  const viewerEl = $("viewer");
  const layer = $("interactionLayer");

  const ELEMENT_COLORS = { C: "0xf3b23c", N: "0x4f8dff", O: "0xff5a4f", S: "0xffe14d", P: "0xff9a3c" };
  const HBOND_COLOR = "0x52d185";
  const HBOND_SHOW_MIN = 0.2; // これより弱い水素結合は線を描かない
  const SUCCESS_RMSD = 2.0; // ドッキング研究で「成功」とされる目安（Å）

  const state = {
    stage: null,
    viewer: null,
    protein: [],
    grid: null,
    template: null,
    refRaw: 1,
    refParts: null,
    pose: null,
    startPose: null,
    level: "rigid",
    mode: "view",
    activeTorsion: -1,
    showAnswer: false,
    surface: null,
    labels: new Map(),
    lastHbondCount: 0,
    timerStart: null,
    timerHandle: null,
    elapsed: 0,
    judged: false,
    drawQueued: false,
    lastResult: null,
    userDriven: false, // 直前の変化がプレイヤーの操作によるものか（効果音を鳴らすかの判定）
    wasClashing: false,
    torsionMarkers: [],
    markerLoop: null,
  };

  // ---------- 効果音（Web Audio で合成。音声ファイルは使わない） ----------

  const sound = {
    ctx: null,
    enabled: true,
    lastClashAt: 0,
    // 水素結合が増えるほど音が上がっていく（ペンタトニック音階）
    scale: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32],

    load() {
      try { this.enabled = localStorage.getItem("dockingLab:sound") !== "off"; } catch (e) { /* 無視 */ }
    },

    // ブラウザの制約で、最初のクリックやタップの後でないと音を出せない
    unlock() {
      if (!this.enabled) return;
      try {
        if (!this.ctx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          this.ctx = new Ctx();
        }
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (e) { /* 音なしで続ける */ }
    },

    tone(freq, { type = "sine", start = 0, duration = 0.18, volume = 0.16, slideTo = null } = {}) {
      if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    },

    hbondGained(count) {
      const f = this.scale[Math.min(count, this.scale.length) - 1] || this.scale[0];
      this.tone(f, { type: "triangle", duration: 0.32, volume: 0.2 });
      this.tone(f * 2, { type: "sine", duration: 0.22, volume: 0.07 });
    },

    hbondLost() {
      this.tone(330, { type: "sine", duration: 0.12, volume: 0.07, slideTo: 220 });
    },

    clash() {
      const now = Date.now();
      if (now - this.lastClashAt < 450) return;
      this.lastClashAt = now;
      this.tone(110, { type: "square", duration: 0.11, volume: 0.07, slideTo: 70 });
    },

    click() {
      this.tone(660, { type: "sine", duration: 0.05, volume: 0.06 });
    },

    judge(kind) {
      if (kind === "success") {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, { type: "triangle", start: i * 0.11, duration: 0.3, volume: 0.2 }));
        this.tone(1318.51, { type: "triangle", start: 0.44, duration: 0.6, volume: 0.2 });
      } else if (kind === "near") {
        this.tone(523.25, { type: "triangle", duration: 0.2, volume: 0.17 });
        this.tone(659.25, { type: "triangle", start: 0.16, duration: 0.32, volume: 0.17 });
      } else {
        this.tone(293.66, { type: "triangle", duration: 0.2, volume: 0.15 });
        this.tone(220, { type: "triangle", start: 0.16, duration: 0.36, volume: 0.15 });
      }
    },
  };

  function toggleSound() {
    sound.enabled = !sound.enabled;
    try { localStorage.setItem("dockingLab:sound", sound.enabled ? "on" : "off"); } catch (e) { /* 無視 */ }
    updateSoundButton();
    if (sound.enabled) { sound.unlock(); sound.click(); }
  }

  function updateSoundButton() {
    const button = $("soundButton");
    button.textContent = sound.enabled ? "音 ON" : "音 OFF";
    button.setAttribute("aria-pressed", String(sound.enabled));
    button.classList.toggle("off", !sound.enabled);
  }

  // ---------- 初期化 ----------

  function init() {
    state.stage = (window.DOCKING_STAGES || [])[0];
    if (!state.stage || !window.$3Dmol) {
      $("loading").textContent = "読み込みに失敗しました。ページを再読み込みしてください。";
      return;
    }
    const stage = state.stage;
    $("stageTitle").textContent = stage.title;
    $("stageBlurb").textContent = stage.blurb;
    $("proteinName").textContent = stage.proteinName;
    $("ligandName").textContent = stage.ligandName;
    $("pdbId").textContent = "PDB " + stage.pdbId;

    state.protein = S.parsePdbAtoms(stage.proteinPdb, stage.proteinFlags);
    state.grid = S.buildGrid(state.protein);
    state.template = S.makeTemplate(stage.ligand);

    const ref = S.scorePose(state.grid, S.placeLigand(state.template, S.crystalPose(state.template)), state.template);
    state.refRaw = ref.raw;
    state.refParts = ref.parts;

    sound.load();
    updateSoundButton();
    setupViewer();
    buildTorsionControls();
    buildTorsionMarkers();
    bindEvents();
    setLevel("rigid");
    setMode("view");
    showBest();
    $("loading").hidden = true;
  }

  function setupViewer() {
    const viewer = $3Dmol.createViewer(viewerEl, { backgroundColor: "#08090a", antialias: true });
    state.viewer = viewer;
    viewer.addModel(state.stage.proteinPdb, "pdb");
    viewer.setStyle({}, { cartoon: { color: "#7d8796", opacity: 0.8 } });

    // 結合部位のまわりのアミノ酸だけ、棒で表示する
    const pocket = pocketResidues(7.0);
    const selections = [];
    for (const [chain, resis] of pocket) selections.push({ chain, resi: Array.from(resis) });
    state.pocketSelection = { or: selections };
    viewer.addStyle(state.pocketSelection, { stick: { radius: 0.13, colorscheme: "whiteCarbon" } });

    viewer.zoomTo(state.pocketSelection);
    lookIntoPocket();
    viewer.render();
  }

  function pocketResidues(cutoff) {
    const result = new Map();
    const crystal = state.template.crystal;
    for (const p of state.protein) {
      for (const l of crystal) {
        if (Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z) < cutoff) {
          if (!result.has(p.chain)) result.set(p.chain, new Set());
          result.get(p.chain).add(p.resi);
          break;
        }
      }
    }
    return result;
  }

  // ポケットの入口方向（タンパク質の中心から結合部位へ向かう向き）
  function pocketOutward() {
    const c = S.centroid(state.protein);
    const l = state.template.center;
    const v = { x: l.x - c.x, y: l.y - c.y, z: l.z - c.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  // 入口方向が手前（画面のこちら側）を向くように視点を回す
  function lookIntoPocket() {
    const viewer = state.viewer;
    if (typeof viewer.getView !== "function" || typeof viewer.setView !== "function") return;
    const a = pocketOutward();
    // a を (0,0,1) に重ねるクォータニオン
    let q = { x: a.y, y: -a.x, z: 0, w: 1 + a.z };
    const n = Math.hypot(q.x, q.y, q.z, q.w);
    if (n < 1e-6) q = { x: 1, y: 0, z: 0, w: 0 };
    else q = { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
    const view = viewer.getView();
    view[4] = q.x; view[5] = q.y; view[6] = q.z; view[7] = q.w;
    viewer.setView(view);
    viewer.zoom(0.8);
  }

  // ---------- ポーズ ----------

  function makeStartPose(level) {
    const out = pocketOutward();
    const tpl = state.template;
    const torsions = tpl.torsions.map(() => 0);
    if (level === "flex") {
      // ねじれをランダムにして、自分自身にぶつからない形を選ぶ
      for (let attempt = 0; attempt < 40; attempt++) {
        const candidate = tpl.torsions.map(() => (Math.random() - 0.5) * Math.PI * 1.6);
        const pts = S.conformer(tpl, candidate);
        const ok = tpl.nonbonded.every(([i, j]) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z) > 3.2);
        if (ok) { candidate.forEach((v, i) => (torsions[i] = v)); break; }
      }
    }
    const R = S.axisAngleMatrix(0.3, 1, 0.5, 2.1);
    // 入口の正面から少し横にずらした場所に置く（最初の視点でポケットと重ならないように）
    const helper = Math.abs(out.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    let side = { x: out.y * helper.z - out.z * helper.y, y: out.z * helper.x - out.x * helper.z, z: out.x * helper.y - out.y * helper.x };
    const sideLen = Math.hypot(side.x, side.y, side.z) || 1;
    side = { x: side.x / sideLen, y: side.y / sideLen, z: side.z / sideLen };
    const lateral = 9;
    let distance = 11;
    let pose;
    for (let i = 0; i < 12; i++) {
      pose = {
        R: R.slice(),
        t: {
          x: tpl.center.x + out.x * distance + side.x * lateral,
          y: tpl.center.y + out.y * distance + side.y * lateral,
          z: tpl.center.z + out.z * distance + side.z * lateral,
        },
        torsions: torsions.slice(),
      };
      const sc = S.scorePose(state.grid, S.placeLigand(tpl, pose), tpl);
      if (sc.counts.clash === 0 && sc.counts.fit < 2) break;
      distance += 2;
    }
    return pose;
  }

  function resetPose() {
    state.pose = makeStartPose(state.level);
    state.startPose = clonePose(state.pose);
    state.judged = false;
    state.showAnswer = false;
    state.lastResult = null;
    state.lastHbondCount = 0;
    state.wasClashing = false;
    state.userDriven = false;
    $("result").hidden = true;
    stopTimer();
    state.elapsed = 0;
    state.timerStart = null;
    $("timer").textContent = "0:00";
    syncTorsionControls();
    requestDraw();
  }

  function clonePose(pose) {
    return { R: pose.R.slice(), t: { ...pose.t }, torsions: pose.torsions.slice() };
  }

  // ---------- 描画 ----------

  function requestDraw() {
    if (state.drawQueued) return;
    state.drawQueued = true;
    requestAnimationFrame(() => {
      state.drawQueued = false;
      draw();
    });
  }

  function draw() {
    const viewer = state.viewer;
    if (!viewer || !state.pose) return;
    const tpl = state.template;
    const placed = S.placeLigand(tpl, state.pose);
    const score = S.scorePose(state.grid, placed, tpl);

    viewer.removeAllShapes();

    if (state.showAnswer) drawMolecule(tpl.crystal, tpl.bonds, { color: "0x3ddc84", alpha: 0.55, scale: 0.85 });
    drawMolecule(placed, tpl.bonds, { highlightTorsion: state.activeTorsion, markTorsions: state.level === "flex" });

    // 水素結合（緑の点線）
    const shown = score.hbonds.filter((h) => h.strength >= HBOND_SHOW_MIN);
    for (const h of shown) {
      const l = placed[h.li];
      viewer.addCylinder({
        start: { x: l.x, y: l.y, z: l.z },
        end: { x: h.p.x, y: h.p.y, z: h.p.z },
        radius: 0.06 + 0.05 * h.strength,
        color: HBOND_COLOR,
        dashed: true,
        dashLength: 0.28,
        gapLength: 0.18,
        fromCap: 1,
        toCap: 1,
      });
      viewer.addSphere({ center: { x: h.p.x, y: h.p.y, z: h.p.z }, radius: 0.34, color: HBOND_COLOR, alpha: 0.75 });
    }

    // ぶつかっている原子（赤い球）
    const clashAtoms = new Set(score.clashes.map((c) => c.li));
    for (const li of clashAtoms) {
      const l = placed[li];
      viewer.addSphere({ center: { x: l.x, y: l.y, z: l.z }, radius: 0.85, color: "0xff3b30", alpha: 0.45 });
    }

    updateLabels(shown);
    viewer.render();
    updatePanel(score, shown.length, clashAtoms.size > 0 || score.intraClash > 0.3);
    state.currentScore = score;
    state.currentPlaced = placed;
  }

  function drawMolecule(atoms, bonds, opts) {
    const viewer = state.viewer;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const scale = opts.scale || 1;
    const hl = opts.highlightTorsion >= 0 ? state.template.torsions[opts.highlightTorsion] : null;
    const sameBond = (t, i, j) => (t.a === i && t.b === j) || (t.a === j && t.b === i);
    for (const [i, j] of bonds) {
      const a = atoms[i], b = atoms[j];
      const isHl = hl && sameBond(hl, i, j);
      // 上級では、ねじれる結合を水色にして見分けられるようにする
      const isTorsion = opts.markTorsions && state.template.torsions.some((t) => sameBond(t, i, j));
      viewer.addCylinder({
        start: { x: a.x, y: a.y, z: a.z },
        end: { x: b.x, y: b.y, z: b.z },
        radius: (isHl ? 0.3 : 0.2) * scale,
        color: isHl ? "0x49c6e5" : isTorsion ? "0x8fd8ee" : opts.color || "0xffe08a",
        alpha,
        fromCap: 1,
        toCap: 1,
      });
    }
    for (const atom of atoms) {
      viewer.addSphere({
        center: { x: atom.x, y: atom.y, z: atom.z },
        radius: (atom.el === "S" ? 0.55 : 0.45) * scale,
        color: opts.color || ELEMENT_COLORS[atom.el] || "0xbec7d5",
        alpha,
      });
    }
  }

  // 水素結合の相手のアミノ酸名を表示する。相手の組が変わったときだけ作り直す
  function updateLabels(hbonds) {
    const wanted = new Map();
    for (const h of hbonds) {
      const key = h.p.chain + ":" + h.p.resi;
      if (!wanted.has(key)) wanted.set(key, h.p);
    }
    for (const [key, label] of state.labels) {
      if (!wanted.has(key)) {
        state.viewer.removeLabel(label);
        state.labels.delete(key);
      }
    }
    for (const [key, p] of wanted) {
      if (state.labels.has(key)) continue;
      const text = residueName(p.res) + p.resi;
      const label = state.viewer.addLabel(text, {
        position: { x: p.x, y: p.y, z: p.z },
        fontColor: "white",
        fontSize: 12,
        backgroundColor: "0x1f8f56",
        backgroundOpacity: 0.85,
        borderThickness: 0,
        inFront: true,
        alignment: "bottomCenter",
      });
      state.labels.set(key, label);
    }
  }

  function residueName(res) {
    return res.charAt(0) + res.slice(1).toLowerCase();
  }

  function toPoints(raw) {
    return Math.max(0, Math.min(100, Math.round((100 * raw) / state.refRaw)));
  }

  function updatePanel(score, hbondCount, clashing) {
    $("liveScore").textContent = String(toPoints(score.raw));
    $("liveHbond").textContent = String(hbondCount);
    $("clashWarning").hidden = !clashing;

    if (hbondCount > state.lastHbondCount) {
      const el = document.querySelector(".hud-hbond");
      el.classList.remove("pulse");
      void el.offsetWidth;
      el.classList.add("pulse");
      if (state.userDriven) sound.hbondGained(hbondCount);
    } else if (hbondCount < state.lastHbondCount && state.userDriven) {
      sound.hbondLost();
    }
    if (clashing && !state.wasClashing && state.userDriven) sound.clash();
    state.lastHbondCount = hbondCount;
    state.wasClashing = clashing;
    state.userDriven = false;

    document.querySelectorAll(".breakdown li").forEach((li) => {
      const term = li.dataset.term;
      const value = score.parts[term] || 0;
      const points = (100 * value) / state.refRaw;
      let ratio;
      if (term === "clash") ratio = Math.min(1, Math.abs(points) / 40);
      else if (term === "electrostatic") ratio = Math.min(1, Math.max(0, points) / 10);
      else ratio = Math.min(1, Math.max(0, value) / (state.refParts[term] || 1));
      li.querySelector("i").style.width = (ratio * 100).toFixed(0) + "%";
      li.querySelector("b").textContent = (points > 0 ? "+" : "") + points.toFixed(0);
    });
  }

  // ---------- 操作 ----------

  function cameraAxes() {
    // 画面の右・上・手前方向を、分子の座標系で返す
    const axes = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, front: { x: 0, y: 0, z: 1 } };
    const viewer = state.viewer;
    if (!viewer || typeof viewer.getView !== "function") return axes;
    const v = viewer.getView();
    if (!v || v.length < 8) return axes;
    const n = Math.hypot(v[4], v[5], v[6], v[7]) || 1;
    const q = { x: -v[4] / n, y: -v[5] / n, z: -v[6] / n, w: v[7] / n };
    return {
      right: quatRotate(q, axes.right),
      up: quatRotate(q, axes.up),
      front: quatRotate(q, axes.front),
    };
  }

  function quatRotate(q, v) {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
  }

  function moveByScreen(dx, dy) {
    const viewer = state.viewer;
    let offset = null;
    if (typeof viewer.screenOffsetToModel === "function") {
      const o = viewer.screenOffsetToModel(dx, dy);
      if (o && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z)) offset = o;
    }
    if (!offset) {
      const ax = cameraAxes();
      const k = 0.06;
      offset = {
        x: (ax.right.x * dx - ax.up.x * dy) * k,
        y: (ax.right.y * dx - ax.up.y * dy) * k,
        z: (ax.right.z * dx - ax.up.z * dy) * k,
      };
    }
    state.pose.t.x += offset.x;
    state.pose.t.y += offset.y;
    state.pose.t.z += offset.z;
  }

  function moveDepth(amount) {
    // amount > 0 で奥へ
    const ax = cameraAxes();
    state.pose.t.x -= ax.front.x * amount;
    state.pose.t.y -= ax.front.y * amount;
    state.pose.t.z -= ax.front.z * amount;
  }

  function rotateByScreen(dx, dy, twist) {
    const ax = cameraAxes();
    const speed = 0.01;
    let R = state.pose.R;
    if (dx) R = S.matMul(S.axisAngleMatrix(ax.up.x, ax.up.y, ax.up.z, dx * speed), R);
    if (dy) R = S.matMul(S.axisAngleMatrix(ax.right.x, ax.right.y, ax.right.z, dy * speed), R);
    if (twist) R = S.matMul(S.axisAngleMatrix(ax.front.x, ax.front.y, ax.front.z, -twist), R);
    state.pose.R = R;
  }

  function touched() {
    if (state.judged) {
      // 答え合わせの後に動かしたら、続きとして再挑戦できる
      state.judged = false;
      $("result").hidden = true;
    }
    startTimer();
    state.userDriven = true;
    requestDraw();
  }

  function bindEvents() {
    document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("levelRigid").addEventListener("click", () => setLevel("rigid"));
    $("levelFlex").addEventListener("click", () => setLevel("flex"));
    $("resetButton").addEventListener("click", resetPose);
    $("judgeButton").addEventListener("click", judge);
    $("surfaceButton").addEventListener("click", toggleSurface);
    $("soundButton").addEventListener("click", toggleSound);
    // 最初の操作で音を出せる状態にする
    ["pointerdown", "keydown", "touchend"].forEach((t) => window.addEventListener(t, () => sound.unlock(), { capture: true, passive: true }));

    holdButton($("depthIn"), () => { moveDepth(0.5); touched(); });
    holdButton($("depthOut"), () => { moveDepth(-0.5); touched(); });

    window.addEventListener("keydown", (event) => {
      if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === "1") setMode("view");
      if (event.key === "2") setMode("move");
      if (event.key === "3") setMode("rotate");
    });

    layer.addEventListener("wheel", (event) => {
      event.preventDefault();
      moveDepth(event.deltaY > 0 ? -0.6 : 0.6);
      touched();
    }, { passive: false });

    bindPointerEvents();
    window.addEventListener("resize", () => { state.viewer.resize(); requestDraw(); });
  }

  // 押している間くり返すボタン
  function holdButton(button, action) {
    let handle = null;
    const stop = () => { if (handle) { clearInterval(handle); handle = null; } };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      action();
      stop();
      handle = setInterval(action, 70);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => button.addEventListener(t, stop));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
    });
  }

  // マウス・タッチ共通のドラッグ処理。
  // 指 1 本: 選んだモードの操作。指 2 本: 回転（ひねり）と、つまんで奥行き。
  function bindPointerEvents() {
    const pointers = new Map();
    let gesture = null;

    const track = (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { layer.setPointerCapture(event.pointerId); } catch (e) { /* 無視 */ }
      gesture = null;
    };

    const release = (event) => {
      pointers.delete(event.pointerId);
      try {
        if (layer.hasPointerCapture && layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
      } catch (e) { /* 無視 */ }
      gesture = null;
    };

    layer.addEventListener("pointerdown", (event) => { event.preventDefault(); track(event); });

    layer.addEventListener("pointermove", (event) => {
      const isMouse = event.pointerType === "mouse";
      const leftDown = (event.buttons & 1) === 1;
      if (!pointers.has(event.pointerId)) {
        // pointerdown が届かない環境（別のボタンが押されたままのマウスなど）への保険
        if (isMouse && leftDown) track(event);
        return;
      }
      if (isMouse && !leftDown) { release(event); return; }

      const prev = pointers.get(event.pointerId);
      const cur = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, cur);

      if (pointers.size === 1) {
        const dx = cur.x - prev.x, dy = cur.y - prev.y;
        if (!dx && !dy) return;
        const rotate = state.mode === "rotate" || event.shiftKey;
        if (rotate) rotateByScreen(dx, dy, 0);
        else moveByScreen(dx, dy);
        touched();
      } else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const now = {
          cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          dist: Math.hypot(b.x - a.x, b.y - a.y),
        };
        if (gesture) {
          let twist = now.angle - gesture.angle;
          if (twist > Math.PI) twist -= 2 * Math.PI;
          if (twist < -Math.PI) twist += 2 * Math.PI;
          rotateByScreen(now.cx - gesture.cx, now.cy - gesture.cy, twist);
          moveDepth((gesture.dist - now.dist) * 0.04);
          touched();
        }
        gesture = now;
      }
    });

    layer.addEventListener("pointerup", release);
    layer.addEventListener("pointercancel", release);
    layer.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function setMode(mode) {
    if (state.mode !== mode) sound.click();
    state.mode = mode;
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    layer.classList.toggle("active", mode !== "view");
    layer.classList.toggle("rotate", mode === "rotate");
    const help = {
      view: "ドラッグでタンパク質ごと回して、いろいろな角度から見ます。ホイールやピンチで拡大・縮小できます。",
      move: "ドラッグで低分子を動かします。ホイールで奥・手前へ。Shift を押しながら、または指 2 本でなぞると回転します。",
      rotate: "ドラッグで低分子の向きを変えます。指 2 本ではひねりも使えます。",
    };
    $("modeHelp").textContent = help[mode];
  }

  function setLevel(level) {
    state.level = level;
    $("levelRigid").classList.toggle("active", level === "rigid");
    $("levelFlex").classList.toggle("active", level === "flex");
    $("torsionSection").hidden = level !== "flex";
    state.activeTorsion = -1;
    resetPose();
    showBest();
    startTorsionMarkers();
  }

  // ---------- ねじれ ----------

  function buildTorsionControls() {
    const list = $("torsionList");
    list.innerHTML = "";
    const tpl = state.template;
    // 環に近い結合から順に並べる
    state.torsionOrder = tpl.torsions.map((t, i) => i).sort((i, j) => tpl.torsions[j].moving.length - tpl.torsions[i].moving.length);
    state.torsionOrder.forEach((index, n) => {
      const row = document.createElement("div");
      row.className = "torsion";
      row.dataset.index = String(index);
      const id = "torsion" + index;
      row.innerHTML =
        `<label for="${id}">結合 ${n + 1}</label>` +
        `<input id="${id}" type="range" min="-180" max="180" step="2" value="0">` +
        `<output>0°</output>`;
      const input = row.querySelector("input");
      const activate = () => {
        state.activeTorsion = index;
        document.querySelectorAll(".torsion").forEach((r) => r.classList.toggle("active", r === row));
        requestDraw();
      };
      input.addEventListener("pointerdown", activate);
      input.addEventListener("focus", activate);
      input.addEventListener("input", () => {
        state.pose.torsions[index] = (Number(input.value) * Math.PI) / 180;
        row.querySelector("output").textContent = input.value + "°";
        activate();
        touched();
      });
      list.appendChild(row);
    });
  }

  // ねじれる結合の番号を、分子の上に小さく重ねて表示する（上級のみ）。
  // 視点を回したときも追従するよう、毎フレーム位置を更新する。
  function buildTorsionMarkers() {
    const box = $("torsionMarkers");
    box.innerHTML = "";
    state.torsionMarkers = state.torsionOrder.map((index, n) => {
      const el = document.createElement("span");
      el.className = "torsion-marker";
      el.textContent = String(n + 1);
      box.appendChild(el);
      return { index, el };
    });
  }

  function updateTorsionMarkers() {
    state.markerLoop = null;
    const box = $("torsionMarkers");
    const visible = state.level === "flex" && state.currentPlaced && typeof state.viewer.modelToScreen === "function";
    box.hidden = !visible;
    if (!visible) return;
    const wrap = box.getBoundingClientRect();
    const placed = state.currentPlaced;
    for (const marker of state.torsionMarkers) {
      const t = state.template.torsions[marker.index];
      const a = placed[t.a], b = placed[t.b];
      const p = state.viewer.modelToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
      // modelToScreen はページ基準（スクロール込み）の座標を返すので、表示枠基準に直す
      const x = p.x - window.pageXOffset - wrap.left;
      const y = p.y - window.pageYOffset - wrap.top;
      const inside = x > 0 && y > 0 && x < wrap.width && y < wrap.height;
      marker.el.style.display = inside ? "" : "none";
      marker.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      marker.el.classList.toggle("active", marker.index === state.activeTorsion);
    }
    state.markerLoop = requestAnimationFrame(updateTorsionMarkers);
  }

  function startTorsionMarkers() {
    if (state.markerLoop == null) state.markerLoop = requestAnimationFrame(updateTorsionMarkers);
  }

  function syncTorsionControls() {
    document.querySelectorAll(".torsion").forEach((row) => {
      const index = Number(row.dataset.index);
      let deg = Math.round((state.pose.torsions[index] * 180) / Math.PI);
      deg = ((deg + 180) % 360 + 360) % 360 - 180;
      row.querySelector("input").value = String(deg);
      row.querySelector("output").textContent = deg + "°";
      row.classList.remove("active");
    });
  }

  // ---------- 答え合わせ ----------

  function judge() {
    if (!state.currentScore) return;
    stopTimer();
    const points = toPoints(state.currentScore.raw);
    const rmsd = S.rmsdToCrystal(state.template, state.currentPlaced);
    const success = rmsd <= SUCCESS_RMSD;
    state.judged = true;
    state.showAnswer = true;
    state.lastResult = { points, rmsd, seconds: state.elapsed };

    const box = $("result");
    box.hidden = false;
    box.classList.toggle("success", success);
    let headline, note;
    if (success) {
      headline = "ドッキング成功！";
      note = `ずれが ${SUCCESS_RMSD} Å 以内なら、研究の世界でも「成功」と判定されます。緑色の分子が、実験で決まった本物の結合ポーズです。`;
    } else if (rmsd <= 4.5) {
      headline = "惜しい！場所は合っています";
      note = "緑色の分子が実験で決まった結合ポーズです。向きやねじれを合わせると、水素結合が一気に増えます。";
    } else {
      headline = "まだ別の場所にいます";
      note = "緑色の分子が実験で決まった結合ポーズです。タンパク質の奥のくぼみを目指してみてください。";
    }
    sound.unlock();
    sound.judge(success ? "success" : rmsd <= 4.5 ? "near" : "far");
    $("resultHeadline").textContent = headline;
    $("resultScore").textContent = points + " 点";
    $("resultRmsd").textContent = rmsd.toFixed(1) + " Å";
    $("resultTime").textContent = formatTime(state.elapsed);
    $("resultNote").textContent = note;
    saveBest(points, rmsd, state.elapsed);
    requestDraw();
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function bestKey() {
    return "dockingLab:best:" + state.stage.id + ":" + state.level;
  }

  function saveBest(points, rmsd, seconds) {
    try {
      const prev = JSON.parse(localStorage.getItem(bestKey()) || "null");
      if (!prev || points > prev.points || (points === prev.points && seconds < prev.seconds)) {
        localStorage.setItem(bestKey(), JSON.stringify({ points, rmsd, seconds }));
      }
    } catch (e) { /* 保存できない環境では記録なしで続ける */ }
    showBest();
  }

  function showBest() {
    let text = "";
    try {
      const best = JSON.parse(localStorage.getItem(bestKey()) || "null");
      if (best) text = `この端末での自己ベスト: ${best.points} 点（ずれ ${best.rmsd.toFixed(1)} Å、${formatTime(best.seconds)}）`;
    } catch (e) { /* 無視 */ }
    $("bestRecord").textContent = text;
  }

  // ---------- 表面表示 ----------

  function toggleSurface() {
    const viewer = state.viewer;
    const button = $("surfaceButton");
    if (state.surface != null) {
      viewer.removeSurface(state.surface);
      state.surface = null;
      button.textContent = "表面を表示";
      viewer.render();
      return;
    }
    button.textContent = "表面を隠す";
    const result = viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.62, color: "#d9dde3" }, {});
    if (result && typeof result.then === "function") {
      result.then((id) => { state.surface = id; viewer.render(); });
      state.surface = -1;
    } else {
      state.surface = result;
      viewer.render();
    }
  }

  // ---------- タイマー ----------

  function startTimer() {
    if (state.timerHandle || state.judged) return;
    state.timerStart = Date.now() - state.elapsed * 1000;
    state.timerHandle = setInterval(() => {
      state.elapsed = (Date.now() - state.timerStart) / 1000;
      $("timer").textContent = formatTime(state.elapsed);
    }, 250);
  }

  function stopTimer() {
    if (!state.timerHandle) return;
    clearInterval(state.timerHandle);
    state.timerHandle = null;
    if (state.timerStart) state.elapsed = (Date.now() - state.timerStart) / 1000;
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  // 動作確認用に内部状態を公開する
  window.__dockingLab = { state, S, draw, judge, setMode, setLevel, sound };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
