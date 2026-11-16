// ドッキングラボ（試作版）: 手動ドッキングの画面と操作。
// スコア計算と分子の幾何は scoring.js（DockScoring）にある。
(function () {
  "use strict";

  const S = window.DockScoring;
  const $ = (id) => document.getElementById(id);

  const viewerEl = $("viewer");
  const layer = $("interactionLayer");

  const ELEMENT_COLORS = { C: "0xf3b23c", N: "0x4f8dff", O: "0xff5a4f", S: "0xffe14d", P: "0xff9a3c", CL: "0x5fe36a", FE: "0xd9662b" };
  const METAL_COLOR = "0xffa94d";
  const CPU_COLOR = "0xb18cff";
  // コンピュータの強さ。rate: 1 秒あたりの探索ステップ数、trialSteps: 1 回の試行の長さ、seconds: 持ち時間
  const CPU_LEVELS = {
    weak: { label: "よわい", rate: 150, trialSteps: 1500, seconds: 45 },
    normal: { label: "ふつう", rate: 400, trialSteps: 2000, seconds: 60 },
    strong: { label: "つよい", rate: 840, trialSteps: 2400, seconds: 60 },
  };
  const HBOND_COLOR = "0x52d185";
  const HBOND_SHOW_MIN = 0.2; // これより弱い水素結合は線を描かない
  const CLASH_SHOW_MIN = 0.08; // これより小さい重なり（Å）は表示しない
  const DEFAULT_SUCCESS_RMSD = 2.0; // ドッキング研究で「成功」とされる目安（Å）

  const state = {
    stages: [],
    stageIndex: -1,
    stage: null,
    hasMetal: false,
    successRmsd: DEFAULT_SUCCESS_RMSD,
    lastMetalCount: 0,
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
    clashPoints: [],
    assisted: false, // おたすけ機能を使ったか（使った回は自己ベストに記録しない）
    refineHandle: null,
    cpu: null, // コンピュータの探索の状態
    cpuViewer: null,
    cpuViewerStage: null,
    cpuViewKey: null,
    cpuLevel: "weak",
    appMode: "manual", // manual: 手動ドッキング、screen: スクリーニング
    screen: null,
    candidate: null,
    candidates: [],
    prediction: null,
    autoJob: null,
    stageTemplate: null,
    pocketCenter: null,
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

    metalGained(count) {
      const f = [196.0, 261.63, 329.63, 392.0][Math.min(count, 4) - 1] || 196.0;
      this.tone(f, { type: "triangle", duration: 0.5, volume: 0.22 });
      this.tone(f * 3, { type: "sine", duration: 0.4, volume: 0.06 });
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
    state.stages = window.DOCKING_STAGES || [];
    if (!state.stages.length || !window.$3Dmol) {
      $("loading").textContent = "読み込みに失敗しました。ページを再読み込みしてください。";
      return;
    }
    sound.load();
    updateSoundButton();
    state.viewer = $3Dmol.createViewer(viewerEl, { backgroundColor: "#08090a", antialias: true });
    buildStageButtons();
    bindEvents();
    setMode("view");
    $("tabScreen").hidden = !(window.DOCKING_SCREENS || []).length;
    loadStage(0);
    startTorsionMarkers();
  }

  function buildStageButtons() {
    const list = $("stageList");
    list.innerHTML = "";
    state.stages.forEach((stage, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stage";
      button.textContent = `${index + 1}. ${stage.short || stage.title}`;
      button.addEventListener("click", () => { if (index !== state.stageIndex) loadStage(index); });
      list.appendChild(button);
    });
  }

  function loadStage(index) {
    state.stageIndex = index;
    document.querySelectorAll(".stage").forEach((b, i) => b.classList.toggle("active", i === index));
    applyStage(state.stages[index]);
  }

  // 組み込みのステージでも、研究室ツールで読み込んだ構造でも、ここから先は同じ扱いになる
  function applyStage(stage) {
    state.stage = stage;
    $("stageTitle").textContent = stage.title;
    $("stageBlurb").textContent = stage.blurb;
    $("proteinName").textContent = stage.proteinName;
    $("ligandName").textContent = stage.ligandName;
    $("pdbId").textContent = "PDB " + stage.pdbId;

    state.protein = stage.proteinAtoms || S.parsePdbAtoms(stage.proteinPdb, stage.proteinFlags);
    state.grid = S.buildGrid(state.protein);
    state.template = S.makeTemplate(stage.ligand);
    state.template.hasAnswer = stage.hasAnswer !== false;
    S.calibrateClash(state.grid, state.template);
    state.currentPlaced = null;
    state.currentScore = null;
    state.stageTemplate = state.template; // 結晶構造のリガンド（ポケットの位置と 100 点の基準）
    state.pocketCenter = state.template.center;
    state.candidate = null;
    state.hasMetal = stage.ligand.atoms.some((a) => a.flags & S.FLAG.METAL);
    state.successRmsd = stage.successRmsd || DEFAULT_SUCCESS_RMSD;

    const ref = S.scorePose(state.grid, S.placeLigand(state.template, S.crystalPose(state.template)), state.template);
    state.refRaw = ref.raw;
    state.refParts = ref.parts;

    // 金属を含むステージだけ、配位結合の表示を出す
    document.querySelectorAll(".metal-only").forEach((el) => (el.hidden = !state.hasMetal));
    const canFlex = state.template.torsions.length > 0;
    $("levelFlex").disabled = !canFlex;
    $("levelFlex").title = canFlex ? "" : "この分子には、ねじれる結合がありません";

    setupViewer();
    buildTorsionControls();
    buildTorsionMarkers();
    setLevel("rigid");
    $("loading").hidden = true;
  }

  function setupViewer() {
    const viewer = state.viewer;
    viewer.removeAllModels();
    viewer.removeAllShapes();
    viewer.removeAllLabels();
    if (typeof viewer.removeAllSurfaces === "function") viewer.removeAllSurfaces();
    state.labels.clear();
    state.surface = null;
    $("surfaceButton").textContent = "表面を表示";

    const stage = state.stage;
    viewer.addModel(stage.structureText || stage.proteinPdb, stage.structureFormat || "pdb");
    viewer.setStyle({}, { cartoon: { color: "#7d8796", opacity: 0.8 } });
    // 補因子や糖鎖など、タンパク質でない部分も細い棒で見えるようにする（水は除く）
    viewer.addStyle({ hetflag: true, not: { resn: ["HOH", "DOD", "WAT"] } }, { stick: { radius: 0.11, colorscheme: "whiteCarbon" } });
    // 選んだリガンドは、こちらで描くので構造側は隠す
    if (stage.hideSelection) viewer.setStyle(stage.hideSelection, {});

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
    const crystal = state.stageTemplate.crystal;
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
    const l = state.pocketCenter;
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
          x: state.pocketCenter.x + out.x * distance + side.x * lateral,
          y: state.pocketCenter.y + out.y * distance + side.y * lateral,
          z: state.pocketCenter.z + out.z * distance + side.z * lateral,
        },
        torsions: torsions.slice(),
      };
      const sc = S.scorePose(state.grid, S.placeLigand(tpl, pose), tpl);
      // ぶつからず、どの項目にも点が入らない（減点もない）場所から始める
      if (sc.counts.clash === 0 && sc.counts.fit < 2 && Math.abs(sc.raw) < 0.05) break;
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
    state.lastMetalCount = 0;
    state.wasClashing = false;
    state.userDriven = false;
    state.assisted = false;
    stopRefine();
    clearCpu();
    stopAutoDock();
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

    if (state.showAnswer && tpl.hasAnswer) drawMolecule(viewer, tpl.crystal, tpl.bonds, { color: "0x3ddc84", alpha: 0.55, scale: 0.85 });
    drawMolecule(viewer, placed, tpl.bonds, { highlightTorsion: state.activeTorsion, markTorsions: state.level === "flex" });

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

    // 金属への配位結合（オレンジの点線）
    const metalShown = score.metalBonds.filter((h) => h.strength >= HBOND_SHOW_MIN);
    for (const h of metalShown) {
      const l = placed[h.li];
      viewer.addCylinder({
        start: { x: l.x, y: l.y, z: l.z },
        end: { x: h.p.x, y: h.p.y, z: h.p.z },
        radius: 0.09 + 0.05 * h.strength,
        color: METAL_COLOR,
        dashed: true,
        dashLength: 0.22,
        gapLength: 0.14,
        fromCap: 1,
        toCap: 1,
      });
      viewer.addSphere({ center: { x: h.p.x, y: h.p.y, z: h.p.z }, radius: 0.36, color: METAL_COLOR, alpha: 0.8 });
    }

    // ぶつかっている原子の組（低分子側とタンパク質側の両方を赤い球で示す）
    const clashPairs = score.clashes.filter((c) => c.overlap >= CLASH_SHOW_MIN).sort((a, b) => b.overlap - a.overlap);
    const clashAtoms = new Set();
    const clashProtein = new Set();
    for (const c of clashPairs) {
      const l = placed[c.li];
      if (!clashAtoms.has(c.li)) {
        clashAtoms.add(c.li);
        viewer.addSphere({ center: { x: l.x, y: l.y, z: l.z }, radius: 0.7, color: "0xff5040", alpha: 0.5 });
      }
      if (!clashProtein.has(c.p.index)) {
        clashProtein.add(c.p.index);
        viewer.addSphere({ center: { x: c.p.x, y: c.p.y, z: c.p.z }, radius: 0.62, color: "0xff5040", alpha: 0.5 });
      }
    }
    // 画面上の目印（タンパク質の陰に隠れていても見える）は、重なりの大きい順に 4 か所まで
    state.clashPoints = clashPairs.slice(0, 4).map((c) => {
      const l = placed[c.li];
      return { x: (l.x + c.p.x) / 2, y: (l.y + c.p.y) / 2, z: (l.z + c.p.z) / 2 };
    });
    const clashNames = [];
    for (const c of clashPairs) {
      const name = residueName(c.p.res) + c.p.resi;
      if (!clashNames.includes(name)) clashNames.push(name);
    }
    $("clashDetail").textContent = clashNames.length ? "ぶつかっている相手: " + clashNames.slice(0, 4).join("、") + (clashNames.length > 4 ? " ほか" : "") : "";

    updateLabels(shown.concat(metalShown), new Set(metalShown.map((h) => h.p.chain + ":" + h.p.resi)));
    viewer.render();
    updatePanel(score, shown.length, clashAtoms.size > 0 || score.intraClash > 0.3, metalShown.length);
    state.currentScore = score;
    state.currentPlaced = placed;
    if (state.candidate && score.raw > state.candidate.bestRaw) {
      state.candidate.bestRaw = score.raw;
      state.candidate.bestPose = clonePose(state.pose);
      updateCandidateCard(state.candidate);
    }
    if (state.cpu && !state.cpu.running) drawCpu();
  }

  function drawMolecule(viewer, atoms, bonds, opts) {
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
        radius: (atom.el === "FE" ? 0.8 : atom.el === "S" || atom.el === "CL" ? 0.55 : 0.45) * scale,
        color: opts.color || (atom.el === "C" && opts.carbonColor) || ELEMENT_COLORS[atom.el] || "0xbec7d5",
        alpha,
      });
    }
  }

  // 水素結合の相手のアミノ酸名を表示する。相手の組が変わったときだけ作り直す
  function updateLabels(bonds, metalKeys) {
    const wanted = new Map();
    for (const h of bonds) {
      const residue = h.p.chain + ":" + h.p.resi;
      // 配位結合の相手はオレンジ、水素結合の相手は緑のラベルにする
      const key = residue + (metalKeys.has(residue) ? ":m" : ":h");
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
        backgroundColor: key.endsWith(":m") ? "0xb5651d" : "0x1f8f56",
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

  function updatePanel(score, hbondCount, clashing, metalCount) {
    $("liveScore").textContent = String(toPoints(score.raw));
    $("liveHbond").textContent = String(hbondCount);
    $("liveMetal").textContent = String(metalCount);
    if (metalCount > state.lastMetalCount && state.userDriven) sound.metalGained(metalCount);
    state.lastMetalCount = metalCount;
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
    stopRefine();
    if (state.autoJob) return; // 自動ドッキング中は手動操作を受け付けない
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
    $("assistNear").addEventListener("click", assistNear);
    $("assistRefine").addEventListener("click", assistRefine);
    $("assistAnswer").addEventListener("click", assistAnswer);
    $("cpuButton").addEventListener("click", toggleCpu);
    $("tabManual").addEventListener("click", () => { if (state.appMode !== "manual") setAppMode("manual"); });
    $("tabScreen").addEventListener("click", () => { if (state.appMode !== "screen") setAppMode("screen"); });
    $("autoOne").addEventListener("click", () => { if (state.candidate) autoDock(state.candidates.indexOf(state.candidate)); });
    $("autoAll").addEventListener("click", autoDockAll);
    $("showScreenResult").addEventListener("click", showScreenResult);
    $("tabLab").addEventListener("click", () => { if (state.appMode !== "lab") setAppMode("lab"); });
    bindLabEvents();
    document.querySelectorAll(".cpu-level").forEach((b) => b.addEventListener("click", () => {
      state.cpuLevel = b.dataset.level;
      document.querySelectorAll(".cpu-level").forEach((x) => x.classList.toggle("active", x === b));
    }));
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
    window.addEventListener("resize", () => {
      state.viewer.resize();
      if (state.cpuViewer && state.cpu) { state.cpuViewer.resize(); state.cpuViewer.render(); }
      requestDraw();
    });
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
      viewerEl.parentElement.classList.add("dragging-ligand");
    };

    const release = (event) => {
      pointers.delete(event.pointerId);
      try {
        if (layer.hasPointerCapture && layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
      } catch (e) { /* 無視 */ }
      gesture = null;
      if (!pointers.size) viewerEl.parentElement.classList.remove("dragging-ligand");
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
    if (level === "flex" && !state.template.torsions.length) level = "rigid";
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

  // 分子の上に重ねる目印（ねじれる結合の番号、衝突の位置）を毎フレーム更新する
  function updateTorsionMarkers() {
    state.markerLoop = requestAnimationFrame(updateTorsionMarkers);
    if (state.cpu && !state.cpu.running && syncCpuView()) state.cpuViewer.render();
    const viewer = state.viewer;
    if (!viewer || typeof viewer.modelToScreen !== "function" || !state.currentPlaced) return;
    const wrap = viewerEl.getBoundingClientRect();
    const project = (point) => {
      const p = viewer.modelToScreen(point);
      // modelToScreen はページ基準（スクロール込み）の座標を返すので、表示枠基準に直す
      const x = p.x - window.pageXOffset - wrap.left;
      const y = p.y - window.pageYOffset - wrap.top;
      return { x, y, inside: x > 0 && y > 0 && x < wrap.width && y < wrap.height };
    };

    const box = $("torsionMarkers");
    const showTorsions = state.level === "flex";
    box.hidden = !showTorsions;
    if (showTorsions) {
      const placed = state.currentPlaced;
      for (const marker of state.torsionMarkers) {
        const t = state.template.torsions[marker.index];
        const a = placed[t.a], b = placed[t.b];
        const p = project({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
        marker.el.style.display = p.inside ? "" : "none";
        marker.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        marker.el.classList.toggle("active", marker.index === state.activeTorsion);
      }
    }

    const clashEls = $("clashMarkers").children;
    for (let i = 0; i < clashEls.length; i++) {
      const point = state.clashPoints[i];
      if (!point) { clashEls[i].style.display = "none"; continue; }
      const p = project(point);
      clashEls[i].style.display = p.inside ? "block" : "none";
      clashEls[i].style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
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

  // ---------- 探索（おたすけの微調整と、コンピュータの対戦相手で共通） ----------

  function gauss() {
    return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
  }

  // ポーズを少しだけランダムに動かす。scale が大きいほど大きく動く
  function perturbPose(pose, scale, flexible) {
    return {
      R: S.matMul(S.axisAngleMatrix(gauss(), gauss(), gauss(), gauss() * 0.25 * scale), pose.R),
      t: { x: pose.t.x + gauss() * 0.6 * scale, y: pose.t.y + gauss() * 0.6 * scale, z: pose.t.z + gauss() * 0.6 * scale },
      torsions: pose.torsions.map((a) => (flexible && Math.random() < 0.4 ? a + gauss() * 0.5 * scale : a)),
    };
  }

  function rawScore(pose) {
    return S.scorePose(state.grid, S.placeLigand(state.template, pose), state.template).raw;
  }

  // ---------- おたすけ ----------

  function markAssisted() {
    state.assisted = true;
    if (state.judged) { state.judged = false; $("result").hidden = true; }
    startTimer();
  }

  // 答えの近く（入口側に少し離れ、向きも少しずれた場所）へ運ぶ
  function assistNear() {
    stopRefine();
    markAssisted();
    const out = pocketOutward();
    const c = state.pocketCenter;
    const tilt = S.axisAngleMatrix(gauss(), gauss(), gauss(), 0.6);
    state.pose.R = tilt;
    state.pose.t = { x: c.x + out.x * 3.5, y: c.y + out.y * 3.5, z: c.z + out.z * 3.5 };
    state.userDriven = true;
    requestDraw();
  }

  // 答えの場所へ運ぶ
  function assistAnswer() {
    if (!state.template.hasAnswer) return;
    stopRefine();
    markAssisted();
    state.pose = S.crystalPose(state.template);
    syncTorsionControls();
    state.userDriven = true;
    requestDraw();
  }

  // 今の場所から、点数が上がる方向へ少しずつ自動で動かす（山登り）
  function assistRefine() {
    stopRefine();
    markAssisted();
    const flexible = state.level === "flex";
    let current = rawScore(state.pose);
    let frame = 0;
    const frames = 60;
    const button = $("assistRefine");
    button.classList.add("busy");
    const tick = () => {
      const scale = 0.3 * (1 - frame / frames) + 0.04;
      for (let i = 0; i < 30; i++) {
        const candidate = perturbPose(state.pose, scale, flexible);
        const sc = rawScore(candidate);
        if (sc > current) { state.pose = candidate; current = sc; }
      }
      state.userDriven = true;
      requestDraw();
      frame++;
      if (frame < frames) state.refineHandle = requestAnimationFrame(tick);
      else { state.refineHandle = null; button.classList.remove("busy"); syncTorsionControls(); }
    };
    state.refineHandle = requestAnimationFrame(tick);
  }

  function stopRefine() {
    if (state.refineHandle) cancelAnimationFrame(state.refineHandle);
    state.refineHandle = null;
    $("assistRefine").classList.remove("busy");
  }

  // ---------- コンピュータと対決 ----------
  // コンピュータは、ポケットのあたりにランダムに分子を置いては、少し動かして点数が上がれば採用する、
  // という試行（焼きなまし法）を時間いっぱい繰り返す。実際のドッキング計算と同じ考え方。

  // 対決中は画面を 2 分割し、右（スマホでは下）にコンピュータ専用の画面を出す
  function openCpuPane() {
    const wrap = viewerEl.parentElement;
    wrap.classList.add("split");
    state.viewer.resize();
    if (!state.cpuViewer) {
      state.cpuViewer = $3Dmol.createViewer($("cpuViewer"), { backgroundColor: "#0d0a14", antialias: true });
    }
    const cv = state.cpuViewer;
    cv.resize();
    if (state.cpuViewerStage !== state.stage.id) {
      cv.removeAllModels();
      cv.addModel(state.stage.proteinPdb, "pdb");
      cv.setStyle({}, { cartoon: { color: "#7d8796", opacity: 0.8 } });
      cv.addStyle(state.pocketSelection, { stick: { radius: 0.13, colorscheme: "whiteCarbon" } });
      state.cpuViewerStage = state.stage.id;
    }
    syncCpuView();
    requestDraw();
  }

  function closeCpuPane() {
    const wrap = viewerEl.parentElement;
    if (!wrap.classList.contains("split")) return;
    wrap.classList.remove("split");
    state.viewer.resize();
    state.viewer.render();
  }

  // コンピュータ側の画面を、プレイヤー側と同じ向き・拡大率にそろえる
  function syncCpuView() {
    if (!state.cpuViewer || !state.cpu) return;
    const view = state.viewer.getView();
    const key = view.map((v) => v.toFixed(3)).join(",");
    if (key === state.cpuViewKey) return false;
    state.cpuViewKey = key;
    state.cpuViewer.setView(view);
    return true;
  }

  function drawCpu() {
    const cv = state.cpuViewer;
    const cpu = state.cpu;
    if (!cv || !cpu) return;
    const tpl = state.template;
    cv.removeAllShapes();
    if (state.showAnswer) drawMolecule(cv, tpl.crystal, tpl.bonds, { color: "0x3ddc84", alpha: 0.55, scale: 0.85 });
    const pose = cpu.running ? cpu.pose : cpu.best.pose;
    if (pose) {
      const placed = S.placeLigand(tpl, pose);
      drawMolecule(cv, placed, tpl.bonds, { carbonColor: CPU_COLOR });
      const score = S.scorePose(state.grid, placed, tpl);
      for (const [bonds, color] of [[score.hbonds, HBOND_COLOR], [score.metalBonds, METAL_COLOR]]) {
        for (const h of bonds) {
          if (h.strength < HBOND_SHOW_MIN) continue;
          const l = placed[h.li];
          cv.addCylinder({
            start: { x: l.x, y: l.y, z: l.z }, end: { x: h.p.x, y: h.p.y, z: h.p.z },
            radius: 0.06 + 0.05 * h.strength, color, dashed: true, dashLength: 0.28, gapLength: 0.18, fromCap: 1, toCap: 1,
          });
        }
      }
      $("cpuNow").textContent = String(toPoints(score.raw));
    }
    cv.render();
  }

  function toggleCpu() {
    if (state.cpu && state.cpu.running) { finishCpu(); return; }
    startCpu();
  }

  function startCpu() {
    clearCpu();
    const config = CPU_LEVELS[state.cpuLevel];
    state.cpu = {
      running: true,
      config,
      flexible: state.level === "flex",
      endAt: Date.now() + config.seconds * 1000,
      lastTick: Date.now(),
      debt: 0,
      trial: 0,
      step: config.trialSteps,
      pose: null,
      current: -Infinity,
      best: { pose: null, score: -Infinity },
      handle: null,
    };
    $("cpuButton").textContent = "コンピュータを止める";
    state.cpu.startedAt = Date.now();
    openCpuPane();
    startTimer();
    state.cpu.handle = requestAnimationFrame(cpuTick);
  }

  function cpuNewTrial(cpu) {
    const tpl = state.template;
    cpu.trial++;
    cpu.step = 0;
    cpu.pose = {
      R: S.axisAngleMatrix(gauss(), gauss(), gauss(), Math.random() * Math.PI * 2),
      t: { x: state.pocketCenter.x + gauss() * 4, y: state.pocketCenter.y + gauss() * 4, z: state.pocketCenter.z + gauss() * 4 },
      torsions: tpl.torsions.map(() => (cpu.flexible ? (Math.random() - 0.5) * Math.PI * 2 : 0)),
    };
    cpu.current = rawScore(cpu.pose);
  }

  function cpuTick() {
    const cpu = state.cpu;
    if (!cpu || !cpu.running) return;
    // 画面の更新速度に関係なく、1 秒あたりのステップ数を一定にする
    const now = Date.now();
    cpu.debt += (Math.min(now - cpu.lastTick, 250) / 1000) * cpu.config.rate;
    cpu.lastTick = now;
    const steps = Math.min(200, Math.floor(cpu.debt));
    cpu.debt -= steps;
    for (let i = 0; i < steps; i++) {
      if (cpu.step >= cpu.config.trialSteps) cpuNewTrial(cpu);
      const progress = cpu.step / cpu.config.trialSteps;
      const temperature = 1.5 * (1 - progress) + 0.02;
      const candidate = perturbPose(cpu.pose, 0.3 + 1.2 * (1 - progress), cpu.flexible);
      const sc = rawScore(candidate);
      if (sc > cpu.current || Math.random() < Math.exp((sc - cpu.current) / temperature)) {
        cpu.pose = candidate;
        cpu.current = sc;
        if (sc > cpu.best.score) cpu.best = { pose: clonePose(candidate), score: sc };
      }
      cpu.step++;
    }
    const left = Math.max(0, Math.ceil((cpu.endAt - Date.now()) / 1000));
    updateCpuStatus(`試行 ${cpu.trial} 回目・残り ${left} 秒`);
    syncCpuView();
    drawCpu();
    // 100 点の場所を見つけたら、そこで探索をやめる
    if (cpu.best.pose && toPoints(cpu.best.score) >= 100) { cpu.found = true; finishCpu(); }
    else if (Date.now() >= cpu.endAt) finishCpu();
    else cpu.handle = requestAnimationFrame(cpuTick);
  }

  function updateCpuStatus(text) {
    const cpu = state.cpu;
    const points = cpu && cpu.best.pose ? toPoints(cpu.best.score) : 0;
    $("cpuScore").textContent = String(points);
    $("cpuStatus").textContent = text;
  }

  function finishCpu() {
    const cpu = state.cpu;
    if (!cpu) return;
    cpu.running = false;
    if (cpu.handle) cancelAnimationFrame(cpu.handle);
    $("cpuButton").textContent = "もう一度対決する";
    if (cpu.best.pose) {
      const rmsd = S.rmsdToCrystal(state.template, S.placeLigand(state.template, cpu.best.pose));
      cpu.rmsd = rmsd;
      const seconds = Math.max(1, Math.round((Date.now() - cpu.startedAt) / 1000));
      updateCpuStatus(cpu.found
        ? `${seconds} 秒、${cpu.trial} 回目の試行で 100 点の場所を見つけて、探索を終えました。「答え合わせ」で勝負！`
        : `探索終了（${cpu.trial} 回試行）。右の画面がコンピュータの答えです。「答え合わせ」で勝負！`);
    } else {
      updateCpuStatus("探索を止めました。");
    }
    drawCpu();
  }

  function clearCpu() {
    if (state.cpu && state.cpu.handle) cancelAnimationFrame(state.cpu.handle);
    state.cpu = null;
    state.cpuViewKey = null;
    closeCpuPane();
    $("cpuButton").textContent = "コンピュータと対決する";
    $("cpuStatus").textContent = "";
    $("resultCpu").hidden = true;
  }

  function showCpuResult(playerPoints) {
    const box = $("resultCpu");
    const cpu = state.cpu;
    if (!cpu || !cpu.best.pose) { box.hidden = true; return; }
    if (cpu.running) finishCpu();
    const cpuPoints = toPoints(cpu.best.score);
    const cpuRmsd = S.rmsdToCrystal(state.template, S.placeLigand(state.template, cpu.best.pose));
    let verdict;
    if (playerPoints > cpuPoints) verdict = "あなたの勝ち！";
    else if (playerPoints < cpuPoints) verdict = "コンピュータの勝ち";
    else verdict = "引き分け";
    box.hidden = false;
    $("resultCpuText").textContent = `${verdict}（コンピュータ「${cpu.config.label}」: ${cpuPoints} 点、ずれ ${cpuRmsd.toFixed(1)} Å）`;
  }

  // ---------- スクリーニング（候補の中から、本物の相手を探す） ----------

  // 自動ドッキングの設定。trials: 試行数、steps: 1 試行のステップ数、frameMs: 1 フレームで計算に使う時間
  const autoConfig = { trials: 40, steps: 3000, frameMs: 12 };

  function setAppMode(mode) {
    if (mode === "screen" && !(window.DOCKING_SCREENS || []).length) return;
    stopAutoDock();
    stopLabCheck();
    stopRefine();
    clearCpu();
    state.appMode = mode;
    document.body.classList.remove("mode-screen", "mode-lab");
    if (mode !== "manual") document.body.classList.add("mode-" + mode);
    $("tabManual").classList.toggle("active", mode === "manual");
    $("tabScreen").classList.toggle("active", mode === "screen");
    $("tabLab").classList.toggle("active", mode === "lab");
    state.screen = null;
    if (mode === "screen") {
      startScreen(window.DOCKING_SCREENS[0]);
    } else if (mode === "lab") {
      if (lab.stage) {
        applyStage(lab.stage);
        state.candidates = lab.candidates;
        buildCandidateCards("labCandidateList", false);
        selectCandidate(0);
      } else {
        state.candidates = [];
        state.candidate = null;
      }
    } else {
      state.candidates = [];
      state.candidate = null;
      loadStage(Math.max(0, state.stageIndex));
    }
    updateJudgeVisibility();
  }

  function startScreen(screen) {
    const stageIndex = state.stages.findIndex((s) => s.id === screen.stageId);
    loadStage(stageIndex);
    state.screen = screen;
    state.prediction = null;
    state.candidates = screen.candidates.map((c) => {
      const template = S.makeTemplate(c.ligand);
      template.hasAnswer = false;
      return { data: c, template, bestRaw: -Infinity, bestPose: null, docked: false };
    });
    $("stageTitle").textContent = screen.title;
    $("screenQuestion").textContent = screen.question;
    $("screenNote").textContent = screen.note || "";
    $("screenResult").hidden = true;
    buildCandidateCards("candidateList", true);
    selectCandidate(0);
  }

  function buildCandidateCards(listId, withPrediction) {
    const list = $(listId);
    list.innerHTML = "";
    state.candidates.forEach((cand, index) => {
      const card = document.createElement("div");
      card.className = "candidate";
      card.innerHTML =
        `<button type="button" class="cand-main"><span class="cand-name"></span><span class="cand-desc"></span></button>` +
        `<span class="cand-score">—</span>` +
        (withPrediction ? `<label class="cand-predict"><input type="radio" name="prediction"> 予想</label>` : "");
      card.querySelector(".cand-name").textContent = cand.data.name;
      card.querySelector(".cand-desc").textContent = cand.data.desc;
      card.querySelector(".cand-main").addEventListener("click", () => selectCandidate(index));
      const radio = card.querySelector("input");
      if (radio) radio.addEventListener("change", () => { state.prediction = cand.data.id; updateScreenButtons(); });
      cand.card = card;
      list.appendChild(card);
    });
    updateScreenButtons();
  }

  function selectCandidate(index) {
    stopAutoDock();
    const cand = state.candidates[index];
    state.candidate = null; // 切り替え中の描画で、前の候補の記録を書き換えないようにする
    state.currentPlaced = null; // 前の分子の座標を、目印の表示に使わないようにする
    state.currentScore = null;
    state.template = cand.template;
    state.level = cand.template.torsions.length ? "flex" : "rigid";
    $("torsionSection").hidden = state.level !== "flex";
    state.activeTorsion = -1;
    buildTorsionControls();
    buildTorsionMarkers();
    resetPose();
    if (cand.bestPose) { state.pose = clonePose(cand.bestPose); syncTorsionControls(); }
    state.candidate = cand;
    state.candidates.forEach((c) => c.card.classList.toggle("active", c === cand));
    updateJudgeVisibility();
    requestDraw();
  }

  function updateCandidateCard(cand) {
    if (!cand.card) return;
    const points = cand.bestRaw > -Infinity ? toPoints(cand.bestRaw) : null;
    cand.card.querySelector(".cand-score").textContent = points == null ? "—" : points + " 点";
    cand.card.classList.toggle("docked", cand.docked);
  }

  // 答え合わせは、結晶構造の正解がある分子のときだけ意味がある
  function updateJudgeVisibility() {
    const show = state.appMode === "manual" || (state.appMode === "lab" && state.template && state.template.hasAnswer);
    $("judgeSection").hidden = !show;
    const assist = $("assistAnswer");
    if (assist) assist.disabled = !(state.template && state.template.hasAnswer);
  }

  function updateScreenButtons() {
    if (state.appMode === "lab") { updateLabButtons(); return; }
    if (state.appMode !== "screen") return;
    const busy = !!state.autoJob;
    const allDocked = state.candidates.length > 0 && state.candidates.every((c) => c.docked);
    $("autoOne").disabled = busy;
    $("autoAll").disabled = busy;
    $("showScreenResult").disabled = busy || !allDocked || !state.prediction;
    let hint = "";
    if (!state.prediction) hint = "まず、いちばん強く結合すると思う分子の「予想」を選んでください。";
    else if (!allDocked) hint = "すべての候補を自動ドッキングすると、結果を見られます。自分の手で動かして試すこともできます。";
    $("screenHint").textContent = busy ? "" : hint;
  }

  // 候補 1 つを自動ドッキングする。終わったら done を呼ぶ
  function autoDock(index, done) {
    selectCandidate(index);
    const cand = state.candidates[index];
    const tpl = cand.template;
    const job = { cand, trial: 0, step: autoConfig.steps, pose: null, current: -Infinity, best: { pose: null, score: -Infinity }, handle: null, done };
    state.autoJob = job;
    updateScreenButtons();
    cand.card.classList.add("busy");
    const tick = () => {
      const t0 = performance.now();
      let finished = false;
      while (performance.now() - t0 < autoConfig.frameMs) {
        if (job.step >= autoConfig.steps) {
          if (job.trial >= autoConfig.trials) { finished = true; break; }
          job.trial++;
          job.step = 0;
          job.pose = {
            R: S.axisAngleMatrix(gauss(), gauss(), gauss(), Math.random() * Math.PI * 2),
            t: { x: state.pocketCenter.x + gauss() * 4, y: state.pocketCenter.y + gauss() * 4, z: state.pocketCenter.z + gauss() * 4 },
            torsions: tpl.torsions.map(() => (Math.random() - 0.5) * Math.PI * 2),
          };
          job.current = rawScore(job.pose);
        }
        const progress = job.step / autoConfig.steps;
        const candidate = perturbPose(job.pose, 0.3 + 1.2 * (1 - progress), true);
        const sc = rawScore(candidate);
        if (sc > job.current || Math.random() < Math.exp((sc - job.current) / (1.5 * (1 - progress) + 0.02))) {
          job.pose = candidate;
          job.current = sc;
          if (sc > job.best.score) job.best = { pose: clonePose(candidate), score: sc };
        }
        job.step++;
      }
      if (finished) {
        state.autoJob = null;
        cand.card.classList.remove("busy");
        cand.docked = true;
        if (job.best.pose) {
          state.pose = clonePose(job.best.pose);
          if (job.best.score > cand.bestRaw) { cand.bestRaw = job.best.score; cand.bestPose = clonePose(job.best.pose); }
        }
        syncTorsionControls();
        progressEl().textContent = "";
        requestDraw();
        updateCandidateCard(cand);
        updateScreenButtons();
        if (job.done) job.done();
        return;
      }
      state.pose = clonePose(job.pose);
      progressEl().textContent = `${cand.data.name} を自動ドッキング中…（${Math.min(job.trial, autoConfig.trials)} / ${autoConfig.trials} 回目の試行）`;
      requestDraw();
      job.handle = requestAnimationFrame(tick);
    };
    job.handle = requestAnimationFrame(tick);
  }

  function autoDockAll() {
    const next = (i) => {
      if (i >= state.candidates.length) return;
      if (state.candidates[i].docked) { next(i + 1); return; }
      autoDock(i, () => next(i + 1));
    };
    next(0);
    if (state.appMode === "lab") $("labRanking").hidden = true;
  }

  function stopAutoDock() {
    const job = state.autoJob;
    if (!job) return;
    if (job.handle) cancelAnimationFrame(job.handle);
    job.cand.card.classList.remove("busy");
    state.autoJob = null;
    progressEl().textContent = "";
    updateScreenButtons();
  }

  function progressEl() {
    return $(state.appMode === "lab" ? "labProgress" : "screenProgress");
  }

  function showScreenResult() {
    const screen = state.screen;
    const ranked = state.candidates.slice().sort((a, b) => b.bestRaw - a.bestRaw);
    const answer = state.candidates.find((c) => c.data.id === screen.answerId);
    const predicted = state.candidates.find((c) => c.data.id === state.prediction);
    const correct = predicted === answer;
    const list = $("screenRanking");
    list.innerHTML = "";
    ranked.forEach((cand, i) => {
      const points = toPoints(cand.bestRaw);
      const row = document.createElement("li");
      row.className = "rank-row truth-" + cand.data.truth;
      row.innerHTML =
        `<div class="rank-head"><span class="rank-no"></span><span class="rank-name"></span><b class="rank-points"></b></div>` +
        `<div class="bar"><i></i></div>` +
        `<div class="rank-truth"></div><p class="rank-lesson"></p>`;
      row.querySelector(".rank-no").textContent = i + 1 + " 位";
      row.querySelector(".rank-name").textContent = cand.data.name + (cand === predicted ? "（あなたの予想）" : "");
      row.querySelector(".rank-points").textContent = points + " 点";
      row.querySelector("i").style.width = points + "%";
      row.querySelector(".rank-truth").textContent = "実際の結合: " + cand.data.truthLabel;
      row.querySelector(".rank-lesson").textContent = cand.data.lesson;
      list.appendChild(row);
    });
    $("screenVerdict").textContent = correct
      ? `正解！本物の相手は「${answer.data.name}」です。`
      : `残念。本物の相手は「${answer.data.name}」でした。`;
    $("screenCaveat").textContent = ranked[0] === answer ? ""
      : `今回の計算では「${ranked[0].data.name}」が 1 位になりました。計算の順位と実際の結合の強さは、いつも一致するとは限りません。`;
    $("screenResult").classList.toggle("success", correct);
    $("screenResult").hidden = false;
    sound.unlock();
    sound.judge(correct ? "success" : "far");
    $("screenResult").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- 研究室ツール（自分の構造で試す） ----------

  const St = window.DockStructure;
  const lab = { structure: null, fileName: "", groups: [], pocket: null, merged: [], stage: null, candidates: [], checkJob: null };
  const checkConfig = { runs: 5, trials: 8, steps: 1800, frameMs: 12, decoyRmsd: 2.5 };

  function labError(message) {
    const el = $("labError");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
      reader.readAsText(file);
    });
  }

  async function loadLabStructure(file) {
    try {
      applyStructureText(file.name, await readFileText(file));
    } catch (error) {
      labError(error.message || String(error));
    }
  }

  function applyStructureText(name, text) {
    labError("");
    $("labInfo").hidden = true;
    $("labPocketWrap").hidden = true;
    $("labDockSection").hidden = true;
    $("labCheckSection").hidden = true;
    {
      const parsed = St.parseStructure(name, text);
      if (parsed.format === "sdf") {
        throw new Error("これは化合物のファイルです。先にタンパク質の構造ファイル（PDB / mmCIF）を読み込んでください。");
      }
      lab.structure = parsed;
      lab.fileName = name;
      lab.groups = St.findLigandGroups(parsed.atoms);
      lab.stage = null;
      lab.candidates = [];
      showLabInfo();
      if (!lab.groups.length) {
        labError("この構造には低分子が入っていません。研究室ツールは、結晶構造に入っている低分子の位置をポケットとして使うため、リガンドを含む構造が必要です。");
        return;
      }
      buildPocketList();
      $("labPocketWrap").hidden = false;
    }
  }

  // ---------- ネットから取り寄せる ----------

  // 3Dmol.js も同じ場所をブラウザから直接読み込んでいる
  const SOURCES = {
    rcsb: (id) => `https://files.rcsb.org/view/${id}.cif`,
    pdbe: (id) => `https://www.ebi.ac.uk/pdbe/entry-files/download/${id.toLowerCase()}.cif`,
    pubchemCid: (cid) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`,
    pubchemName: (name) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/SDF?record_type=3d`,
  };

  const OFFLINE_HINT = "ネットワークに届きませんでした。大学のネットワークの制限や、ページをファイルとして開いていることが原因かもしれません。サイトからファイルを保存して読み込んでください。";

  async function fetchText(url) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      const err = new Error(OFFLINE_HINT);
      err.offline = true;
      throw err;
    }
    if (response.status === 404) {
      const err = new Error("見つかりませんでした。");
      err.notFound = true;
      throw err;
    }
    if (!response.ok) throw new Error(`取得できませんでした（${response.status}）。`);
    return response.text();
  }

  function setFetchBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = busy ? "取得中…" : label;
  }

  async function fetchPdbEntry() {
    const input = $("labPdbId");
    const id = input.value.trim().toUpperCase().replace(/^PDB[:\s-]*/, "");
    if (!/^[0-9][0-9A-Z]{3}$/.test(id)) {
      labError("PDB ID は数字 1 文字＋英数字 3 文字です（例: 1AVD）。");
      return;
    }
    labError("");
    const button = $("labFetch");
    setFetchBusy(button, true, "PDB から取得");
    try {
      // RCSB が届かないときのために、PDBe からも試す。
      // 「その ID が無い」と言えるのは、本家の RCSB が 404 を返したときだけ
      let text = null, lastError = null, missingAtRcsb = false;
      for (const source of ["rcsb", "pdbe"]) {
        try { text = await fetchText(SOURCES[source](id)); break; }
        catch (error) {
          lastError = error;
          if (error.notFound && source === "rcsb") missingAtRcsb = true;
        }
      }
      if (text == null) {
        if (missingAtRcsb) throw new Error(`${id} という構造が見つかりませんでした。ID を確かめてください。`);
        throw new Error(OFFLINE_HINT);
      }
      applyStructureText(id + ".cif", text);
      input.value = "";
    } catch (error) {
      labError(error.message || String(error));
    } finally {
      setFetchBusy(button, false, "PDB から取得");
    }
  }

  async function fetchCompound() {
    const input = $("labCompound");
    const query = input.value.trim();
    if (!query) return;
    labError("");
    const button = $("labFetchCompound");
    setFetchBusy(button, true, "PubChem から取得");
    try {
      const url = /^\d+$/.test(query) ? SOURCES.pubchemCid(query) : SOURCES.pubchemName(query);
      let text;
      try {
        text = await fetchText(url);
      } catch (error) {
        if (error.notFound) {
          throw new Error(`「${query}」の立体構造が PubChem に見つかりませんでした。英語名（例: estradiol）か CID を試してください。`);
        }
        throw error;
      }
      const molecules = St.parseSdf(text);
      if (!molecules.length) throw new Error("取り寄せたデータから分子を読み取れませんでした。");
      for (const mol of molecules) {
        if (/^\d+$/.test(mol.name || "")) mol.name = `${query}（CID ${mol.name}）`;
      }
      addLigandMolecules(molecules, "PubChem");
      input.value = "";
    } catch (error) {
      labError(error.message || String(error));
    } finally {
      setFetchBusy(button, false, "PubChem から取得");
    }
  }

  function showLabInfo() {
    const atoms = lab.structure.atoms;
    const chains = new Set(), residues = new Set();
    let hetero = 0;
    for (const a of atoms) {
      chains.add(a.chain);
      if (a.hetero) hetero++;
      else residues.add(a.chain + ":" + a.resi);
    }
    const info = $("labInfo");
    info.innerHTML =
      `<strong>${escapeHtml(lab.fileName)}</strong><br>` +
      `原子 ${atoms.length.toLocaleString()} 個（うち低分子など ${hetero.toLocaleString()} 個）／ 鎖 ${chains.size} 本 ／ アミノ酸 ${residues.size.toLocaleString()} 残基` +
      (atoms.length > 40000 ? "<br>大きな構造なので、表示や計算に時間がかかることがあります。" : "");
    info.hidden = false;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function buildPocketList() {
    const list = $("labPocketList");
    list.innerHTML = "";
    lab.groups.slice(0, 24).forEach((group) => {
      const card = document.createElement("div");
      card.className = "candidate";
      card.innerHTML = `<button type="button" class="pocket-row"><span class="cand-name"></span><span class="cand-desc"></span></button>`;
      card.querySelector(".cand-name").textContent = group.label;
      card.querySelector(".cand-desc").textContent =
        `原子 ${group.count} 個` + (group.metal ? "・金属イオン" : "") +
        (group.sugar ? "・糖鎖" : "") + (group.solvent ? "・結晶化に使う物質かもしれません" : "");
      card.querySelector("button").addEventListener("click", () => choosePocket(group));
      group.card = card;
      list.appendChild(card);
    });
  }

  function choosePocket(group) {
    labError("");
    const parsed = lab.structure;
    // 金属イオンと、それに配位している小さなイオン（炭酸イオンなど）は 1 つの分子として扱う
    const merged = St.nearbyGroups(lab.groups, group, 2.4).filter((g) => g.count <= 6 && !g.solvent);
    const ligandSource = [...group.atoms, ...merged.flatMap((g) => g.atoms)];
    const exclude = new Set(ligandSource);
    const receptor = parsed.atoms.filter((a) => !exclude.has(a) && !["HOH", "DOD", "WAT"].includes(a.res));
    if (receptor.length < 50) {
      labError("まわりのタンパク質が少なすぎます。別の低分子を選んでください。");
      return;
    }
    St.typeProtein(receptor);
    const ligand = St.buildLigandFromAtoms(ligandSource);
    lab.pocket = group;
    lab.merged = merged;
    const hideSelection = { or: [group, ...merged].map((g) => ({ chain: g.chain, resi: g.resi, resn: g.res })) };
    const name = [group.res, ...merged.map((g) => g.res)].join(" + ");
    lab.stage = {
      id: "lab:" + lab.fileName + ":" + group.id,
      title: `${name}（${lab.fileName}）`,
      blurb: "",
      proteinName: lab.fileName,
      ligandName: name,
      pdbId: "読み込んだファイル",
      structureText: parsed.text,
      structureFormat: parsed.format === "cif" ? "cif" : "pdb",
      proteinAtoms: receptor,
      ligand,
      hideSelection,
      successRmsd: ligand.atoms.length <= 8 ? 1.0 : 2.0,
    };
    applyStage(lab.stage);
    lab.groups.forEach((g) => g.card && g.card.classList.toggle("active", g === group));

    lab.candidates = [{
      data: {
        id: "crystal",
        name: name + "（構造の中のリガンド）",
        desc: merged.length ? "結晶構造にある低分子。まわりのイオンも一緒に扱います。" : "結晶構造にある低分子。正解の位置が分かります。",
      },
      template: state.template,
      bestRaw: -Infinity, bestPose: null, docked: false,
    }];
    state.candidates = lab.candidates;
    buildCandidateCards("labCandidateList", false);
    selectCandidate(0);
    $("labDockSection").hidden = false;
    $("labCheckSection").hidden = false;
    $("labRanking").hidden = true;
    $("labCheckResult").hidden = true;
  }

  async function addLabLigands(files) {
    labError("");
    let added = 0;
    for (const file of files) {
      try {
        const text = await readFileText(file);
        const molecules = St.parseSdf(text);
        if (!molecules.length) { labError(`${file.name} から分子を読み取れませんでした。SDF または MOL（V2000）に対応しています。`); continue; }
        added += addLigandMolecules(molecules, file.name, true);
      } catch (error) {
        labError(error.message || String(error));
      }
    }
    if (added) refreshLabCandidates();
  }

  // 読み取った分子を、試す分子の一覧に加える
  function addLigandMolecules(molecules, sourceLabel, deferRefresh) {
    if (!lab.stage) { labError("先に構造ファイルを読み込んで、ポケットを選んでください。"); return 0; }
    let added = 0;
    for (const mol of molecules) {
      const ligand = St.buildLigandFromMolecule(mol);
      if (ligand.atoms.length < 3) continue;
      const template = S.makeTemplate(ligand);
      template.hasAnswer = false;
      lab.candidates.push({
        data: {
          id: "sdf" + lab.candidates.length,
          name: mol.name || sourceLabel,
          desc: `${sourceLabel}・原子 ${ligand.atoms.length} 個・ねじれる結合 ${ligand.torsions.length} 本`,
        },
        template, bestRaw: -Infinity, bestPose: null, docked: false,
      });
      added++;
    }
    if (added && !deferRefresh) refreshLabCandidates();
    return added;
  }

  function refreshLabCandidates() {
    state.candidates = lab.candidates;
    buildCandidateCards("labCandidateList", false);
    selectCandidate(lab.candidates.length - 1);
  }

  function updateLabButtons() {
    const busy = !!state.autoJob;
    const ready = !!lab.stage;
    $("labAutoOne").disabled = busy || !ready;
    $("labAutoAll").disabled = busy || !ready;
    $("labRank").disabled = busy || !ready || !lab.candidates.some((c) => c.docked);
    $("labAddLigand").disabled = busy || !ready;
    $("labFetchCompound").disabled = busy || !ready;
    $("labCheck").disabled = busy || !ready || !!lab.checkJob;
  }

  function showLabRanking() {
    const ranked = lab.candidates.filter((c) => c.bestRaw > -Infinity).sort((a, b) => b.bestRaw - a.bestRaw);
    const list = $("labRanking");
    list.innerHTML = "";
    ranked.forEach((cand, i) => {
      const points = toPoints(cand.bestRaw);
      const row = document.createElement("li");
      row.className = "rank-row";
      row.innerHTML = `<div class="rank-head"><span class="rank-no"></span><span class="rank-name"></span><b class="rank-points"></b></div><div class="bar"><i></i></div>`;
      row.querySelector(".rank-no").textContent = i + 1 + " 位";
      row.querySelector(".rank-name").textContent = cand.data.name;
      row.querySelector(".rank-points").textContent = points + " 点";
      row.querySelector("i").style.width = points + "%";
      list.appendChild(row);
    });
    list.hidden = !ranked.length;
  }

  // ---------- スコアがこの系で使えるかを調べる（再ドッキング検証） ----------

  function startLabCheck() {
    const tpl = state.stageTemplate;
    if (lab.checkJob || !tpl || !tpl.hasAnswer) return;
    const job = {
      run: 0, trial: 0, step: checkConfig.steps,
      pose: null, current: -Infinity,
      trialBest: { score: -Infinity, pose: null },
      runBest: -Infinity, decoyBest: -Infinity, beat: 0,
      done: 0, total: checkConfig.runs * checkConfig.trials * checkConfig.steps,
      handle: null,
    };
    lab.checkJob = job;
    $("labCheckResult").hidden = true;
    updateLabButtons();
    const raw = (pose) => S.scorePose(state.grid, S.placeLigand(tpl, pose), tpl).raw;

    const endTrial = () => {
      if (!job.trialBest.pose) return;
      const rmsd = S.rmsdToCrystal(tpl, S.placeLigand(tpl, job.trialBest.pose));
      if (rmsd > checkConfig.decoyRmsd) job.decoyBest = Math.max(job.decoyBest, job.trialBest.score);
      job.runBest = Math.max(job.runBest, job.trialBest.score);
      job.trialBest = { score: -Infinity, pose: null };
    };

    const tick = () => {
      const start = performance.now();
      while (performance.now() - start < checkConfig.frameMs) {
        if (job.step >= checkConfig.steps) {
          endTrial();
          if (job.trial >= checkConfig.trials) {
            if (job.runBest > state.refRaw) job.beat++;
            job.runBest = -Infinity;
            job.trial = 0;
            job.run++;
            if (job.run >= checkConfig.runs) { finishLabCheck(job); return; }
          }
          job.trial++;
          job.step = 0;
          job.pose = {
            R: S.axisAngleMatrix(gauss(), gauss(), gauss(), Math.random() * Math.PI * 2),
            t: { x: state.pocketCenter.x + gauss() * 4, y: state.pocketCenter.y + gauss() * 4, z: state.pocketCenter.z + gauss() * 4 },
            torsions: tpl.torsions.map(() => (Math.random() - 0.5) * Math.PI * 2),
          };
          job.current = raw(job.pose);
        }
        const progress = job.step / checkConfig.steps;
        const candidate = perturbPose(job.pose, 0.3 + 1.2 * (1 - progress), true);
        const score = raw(candidate);
        if (score > job.current || Math.random() < Math.exp((score - job.current) / (1.5 * (1 - progress) + 0.02))) {
          job.pose = candidate;
          job.current = score;
          if (score > job.trialBest.score) job.trialBest = { score, pose: clonePose(candidate) };
        }
        job.step++;
        job.done++;
      }
      $("labCheckProgress").textContent = `調べています… ${Math.round((100 * job.done) / job.total)}%`;
      job.handle = requestAnimationFrame(tick);
    };
    job.handle = requestAnimationFrame(tick);
  }

  function stopLabCheck() {
    if (!lab.checkJob) return;
    if (lab.checkJob.handle) cancelAnimationFrame(lab.checkJob.handle);
    lab.checkJob = null;
    $("labCheckProgress").textContent = "";
    updateLabButtons();
  }

  function finishLabCheck(job) {
    lab.checkJob = null;
    $("labCheckProgress").textContent = "";
    const decoy = job.decoyBest > -Infinity ? toPoints(job.decoyBest) : 0;
    let verdict, note;
    if (decoy >= 100) {
      verdict = "この系では、スコアが正解を指していません";
      note = "結晶構造と違う場所に、同じか高い点数が出ています。この系で点数の順位を比べても、結合の強さの目安にはなりません。ゲームのステージにも向きません。";
    } else if (decoy >= 90) {
      verdict = "きわどい系です";
      note = "結晶構造と違う場所にも、近い点数が出ています。点数の差が小さいときは、結論を出さないでください。";
    } else {
      verdict = "この系では、スコアが正解を指しています";
      note = "結晶構造のポーズがはっきり最高点になりました。ただし、よく似た分子どうしの小さな差を見分けられるかは、これとは別の問題です。";
    }
    $("labCheckVerdict").textContent = verdict;
    $("labCheckDecoy").textContent = decoy + " 点";
    $("labCheckBeat").textContent = `${job.beat} / ${checkConfig.runs} 回`;
    $("labCheckNote").textContent = note;
    $("labCheckResult").classList.toggle("success", decoy < 90);
    $("labCheckResult").hidden = false;
    updateLabButtons();
  }

  function bindLabEvents() {
    const file = $("labFile");
    $("labPick").addEventListener("click", () => file.click());
    file.addEventListener("change", () => { if (file.files[0]) loadLabStructure(file.files[0]); file.value = ""; });
    const drop = $("labDrop");
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) loadLabStructure(e.dataTransfer.files[0]); });
    const ligandFile = $("labLigandFile");
    $("labAddLigand").addEventListener("click", () => ligandFile.click());
    ligandFile.addEventListener("change", () => { if (ligandFile.files.length) addLabLigands(Array.from(ligandFile.files)); ligandFile.value = ""; });
    $("labAutoOne").addEventListener("click", () => { if (state.candidate) autoDock(state.candidates.indexOf(state.candidate)); });
    $("labAutoAll").addEventListener("click", autoDockAll);
    $("labRank").addEventListener("click", showLabRanking);
    $("labCheck").addEventListener("click", startLabCheck);
    $("labFetch").addEventListener("click", fetchPdbEntry);
    $("labFetchCompound").addEventListener("click", fetchCompound);
    $("labPdbId").addEventListener("keydown", (e) => { if (e.key === "Enter") fetchPdbEntry(); });
    $("labCompound").addEventListener("keydown", (e) => { if (e.key === "Enter") fetchCompound(); });
  }

  // ---------- 答え合わせ ----------

  function judge() {
    if (!state.currentScore || !state.template.hasAnswer) return;
    stopTimer();
    const points = toPoints(state.currentScore.raw);
    const rmsd = S.rmsdToCrystal(state.template, state.currentPlaced);
    const limit = state.successRmsd;
    const success = rmsd <= limit;
    state.judged = true;
    state.showAnswer = true;
    state.lastResult = { points, rmsd, seconds: state.elapsed };

    const box = $("result");
    box.hidden = false;
    box.classList.toggle("success", success);
    let headline, note;
    if (success) {
      headline = "ドッキング成功！";
      note = limit === DEFAULT_SUCCESS_RMSD
        ? `ずれが ${limit} Å 以内なら、研究の世界でも「成功」と判定されます。緑色の分子が、実験で決まった本物の結合ポーズです。`
        : `小さな分子なので、ずれ ${limit} Å 以内を成功としています。緑色の分子が、実験で決まった本物の結合ポーズです。`;
    } else if (rmsd <= 4.5) {
      headline = "惜しい！場所は合っています";
      note = "緑色の分子が実験で決まった結合ポーズです。向きを合わせると、結合が一気に増えます。";
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
    $("resultAssist").hidden = !state.assisted;
    showCpuResult(points);
    if (!state.assisted) saveBest(points, rmsd, state.elapsed);
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
  window.__dockingLab = { state, S, St, lab, draw, judge, setMode, setLevel, sound, loadStage, setAppMode, autoConfig, checkConfig, choosePocket, loadLabStructure, applyStructureText, SOURCES };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
