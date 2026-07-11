const viewerEl = document.getElementById("viewer");
window.POCKET_APP_VERSION = "3dmol-stages-v2";
const interactionLayer = document.getElementById("interactionLayer");
const depthSlider = document.getElementById("depthSlider");
const resetButton = document.getElementById("resetButton");
const scoreButton = document.getElementById("scoreButton");
const scoreButtonFloat = document.getElementById("scoreButtonFloat");
const floatScoreNum = document.getElementById("floatScoreNum");
const floatScoreLabel = document.getElementById("floatScoreLabel");
const hintButton = document.getElementById("hintButton");
const answerButton = document.getElementById("answerButton");
const spotHintButton = document.getElementById("spotHintButton");
const stageButtonsEl = document.getElementById("stageButtons");
const stageBlurbEl = document.getElementById("stageBlurb");
const proteinNameEl = document.getElementById("proteinName");
const ligandNameEl = document.getElementById("ligandName");
const confettiCanvas = document.getElementById("confetti");
const celebrateBanner = document.getElementById("celebrateBanner");
const hudMissionEl = document.getElementById("hudMission");
const hudTimerEl = document.getElementById("hudTimer");
const hudTimerValueEl = document.getElementById("hudTimerValue");
const bestScoreEl = document.getElementById("bestScore");
const bestTimeEl = document.getElementById("bestTime");
const leaderboardEl = document.getElementById("leaderboard");
const modeButtons = {
  view: document.getElementById("viewModeButton"),
  move: document.getElementById("moveModeButton"),
  rotate: document.getElementById("rotateModeButton"),
};
const scoreNumber = document.querySelector(".score-number");
const scoreLabel = document.querySelector(".score-label");
const enclosureScoreEl = document.getElementById("enclosureScore");
const collisionScoreEl = document.getElementById("collisionScore");
const contactScoreEl = document.getElementById("contactScore");
const message = document.getElementById("message");
const nameEntryModal = document.getElementById("nameEntryModal");
const nameEntryConfirm = document.getElementById("nameEntryConfirm");
const nameEntrySkip = document.getElementById("nameEntrySkip");
const nameLetterEls = [
  document.getElementById("nameLetter0"),
  document.getElementById("nameLetter1"),
  document.getElementById("nameLetter2"),
];

const CLEAR_THRESHOLD = 50;
const RECORDS_KEY = "pocketGame.records.v1";
const LEADERBOARD_KEY = "pocketGame.leaderboard.v1";
const LEADERBOARD_MAX = 5;

const STAGES = [
  {
    id: "lactoferrin-catechin",
    title: "1. カテキン",
    protein: "../pdb_cache/1blf.cif",
    proteinName: "ラクトフェリン（ミルク由来タンパク質）",
    ligand: "catechin.sdf",
    ligandName: "カテキン（茶ポリフェノール）",
    blurb: "食品成分カテキンは、ラクトフェリンのどのくぼみにハマりそう？",
    mission: "ミッション: カテキンをくぼみにはめて 50点以上でクリア！",
    timeLimit: 180,
    clearThreshold: 50,
    answerKind: "pocket",
    answerNote: "ラクトフェリンとカテキンの本当の結合部位は、実はまだ誰も分かっていません。これはゲームのルールで高得点になるくぼみの一例です（候補は複数）。",
  },
  {
    id: "lactoferrin-ampicillin",
    title: "2. 抗菌薬",
    protein: "../pdb_cache/1blf.cif",
    proteinName: "ラクトフェリン（ミルク由来タンパク質）",
    ligand: "ligands/ampicillin.sdf",
    ligandName: "アンピシリン（β-ラクタム系抗菌薬）",
    blurb: "抗菌薬アンピシリンを、標的タンパク質のポケットに収めてみよう。",
    mission: "ミッション: 大きな抗菌薬を標的ポケットに収めろ！めり込み注意。",
    timeLimit: 240,
    clearThreshold: 50,
    answerKind: "pocket",
    answerNote: "抗菌薬との本当の結合部位はまだ未解明です。これはゲームのルールで高得点になる標的タンパク質のくぼみの一例です（候補は複数）。",
  },
  {
    id: "cholera-gm1",
    title: "3. トキシンとGM1",
    protein: "../pdb_cache/1xtc.cif",
    proteinName: "コレラトキシン（標的: Bサブユニット）",
    ligand: "ligands/gm1_pentasaccharide.sdf",
    ligandName: "GM1五糖（GM1ガングリオシドの糖鎖）",
    blurb: "コレラトキシンのBサブユニットは、宿主細胞表面のGM1ガングリオシドに結合して侵入する。GM1の糖鎖を結合ポケットへ導こう。",
    mission: "ミッション: Bサブユニットの糖結合ポケットにGM1五糖をはめて 35点以上でクリア！",
    timeLimit: 240,
    clearThreshold: 35,
    answerKind: "ctb",
    answerNote: "実際のGM1結合部位の1つです。コレラトキシンには5か所あり、毎回ランダムに表示します。",
  },
  {
    id: "blg-retinol",
    title: "4. ビタミンA",
    protein: "../pdb_cache/1gx8.cif",
    proteinName: "β-ラクトグロブリン（乳清タンパク質）",
    ligand: "ligands/retinol.sdf",
    ligandName: "レチノール（ビタミンA）",
    blurb: "牛乳の乳清タンパク質β-ラクトグロブリンは、深い袋状ポケットにビタミンAなどの脂溶性分子を包んで運ぶ。レチノールをポケットへ収めよう。",
    mission: "ミッション: レチノールをβ-ラクトグロブリンの袋状ポケットに収めて 50点以上でクリア！",
    timeLimit: 180,
    clearThreshold: 50,
    answerKind: "hetsite",
    hetCode: "RTL",
    answerNote: "実際にレチノールが結合している袋状ポケット（カリックス）です。深いポケットなのできれいに収まります。",
  },
  {
    id: "avidin-biotin",
    title: "5. ビオチン（卵の抗栄養因子）",
    protein: "../pdb_cache/1avd.cif",
    proteinName: "アビジン（卵白由来タンパク質）",
    ligand: "ligands/biotin.sdf",
    ligandName: "ビオチン（ビタミンB7）",
    blurb: "卵白のアビジンはビオチンを驚異的な強さ（Kd〜10⁻¹⁵M）で抱え込む。生卵白を摂り続けるとビオチン欠乏症になるのはこのため。今回は「表面のくぼみ」ではなく、タンパク質の中に完全に閉じ込められた場所を探そう。",
    mission: "ミッション: ビオチンをアビジンの内部空洞に完全に埋め込め！ 少しでもはみ出すと減点。",
    timeLimit: 240,
    clearThreshold: 55,
    answerKind: "hetsite",
    hetCode: "BTN",
    mode: "buried",
    answerNote: "実際にビオチンが結合しているβバレル内部の空洞です。生化学で最も強い非共有結合の一つとして知られています。",
  },
];

const atomColors = {
  C: "0xf3b23c",
  O: "0xe65a4f",
  N: "0x5fa8ff",
  H: "0xf6f2ea",
  S: "0xf2d24b",
};

const state = {
  viewer: null,
  mol3d: null,
  stageIndex: 0,
  proteinAtoms: [],
  proteinCenter: { x: 0, y: 0, z: 0 },
  proteinRadius: 30,
  ligandTemplate: null,
  ligandHeavyCount: 12,
  pocketHints: [],
  answerSites: [],
  answerMarker: null,
  spotHints: [],
  cleared: {},
  records: {},
  leaderboard: {},
  nameEntry: null,
  nameEntryTimer: null,
  depthBase: 0,
  mode: "view",
  showHints: false,
  dragging: false,
  audioCtx: null,
  timer: null,
  timeLimit: 90,
  timeLeft: 90,
  timerRunning: false,
  timedOut: false,
  last: { x: 0, y: 0 },
  pose: { tx: 0, ty: 0, tz: 0, R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
};

init();

async function init() {
  const mol3d = window.$3Dmol || window["3Dmol"];
  if (!mol3d) {
    message.textContent = "3Dmol.jsを読み込めません。3Dmol-min.jsの場所を確認してください。";
    return;
  }
  state.mol3d = mol3d;
  state.records = loadRecords();
  state.leaderboard = loadLeaderboard();
  bindEvents();
  buildStageButtons();
  renderLeaderboard();

  state.viewer = mol3d.createViewer(viewerEl, {
    backgroundColor: "black",
    antialias: true,
  });

  await loadStage(0);
}

async function loadStage(index) {
  const stage = STAGES[index];
  if (!stage) return;
  state.stageIndex = index;
  stopTimer();
  closeNameEntry();
  updateStageButtons();
  clearScore();
  message.textContent = "構造を読み込んでいます…";

  try {
    const [cifText, sdfText] = await Promise.all([
      fetch(stage.protein).then((res) => res.text()),
      fetch(stage.ligand).then((res) => res.text()),
    ]);

    state.proteinAtoms = parseCifAtoms(cifText);
    state.proteinCenter = centroid(state.proteinAtoms);
    state.proteinRadius = boundingRadius(state.proteinAtoms, state.proteinCenter);
    state.pocketHints = buildPocketHints(state.proteinAtoms);
    // "pocket" は初回の「正解を見る」で高スコア地点を探索してキャッシュ（遅延計算）
    state.answerSites = stage.answerKind === "pocket"
      ? []
      : parseAnswerSites(cifText, stage.answerKind, stage.hetCode);
    state.answerMarker = null;
    state.spotHints = [];
    state.ligandTemplate = parseSdf(sdfText);
    state.ligandHeavyCount = Math.max(
      6,
      state.ligandTemplate.atoms.filter((atom) => atom.element !== "H").length
    );
    state.ligandMaxRadius = state.ligandTemplate.atoms.reduce(
      (max, a) => Math.max(max, Math.hypot(a.x, a.y, a.z)),
      0
    );

    state.viewer.clear();
    const proteinModel = state.viewer.addModel(cifText, "cif");
    const buriedStage = stage.mode === "buried";
    if (buriedStage) {
      // 埋没型は「白い不透明サーフェス」があると内部の空洞が完全に見えなくなり手探りになる。
      // 半透明サーフェス＋cartoonの重ね描画は3Dmol側で面が重なって黒くつぶれることがあるため、
      // 埋没型はサーフェスを出さずcartoon（骨格）だけで内部が見通せるようにする。
      // 採点は引き続き実際の原子間距離で行うので、見やすくなるだけで判定が甘くなるわけではない。
      proteinModel.setStyle({}, { cartoon: { color: "white", opacity: 0.9 } });
    } else {
      proteinModel.setStyle({}, { cartoon: { color: "white", opacity: 0.18 } });
      state.viewer.addSurface(
        state.mol3d.SurfaceType.VDW,
        { color: "white", opacity: 0.82 },
        { model: proteinModel }
      );
    }
    state.viewer.zoomTo();
    state.viewer.render();

    stageBlurbEl.textContent = stage.blurb;
    proteinNameEl.textContent = stage.proteinName;
    ligandNameEl.textContent = stage.ligandName;
    hudMissionEl.textContent = stage.mission;
    resetTimer(stage.timeLimit);
    renderRecords();

    state.showHints = false;
    hintButton.textContent = "くぼみ候補を表示";
    setMode("view");
    resetPose();
    message.textContent = buriedStage
      ? "タンパク質を回して、内部に透けて見える空洞を探してください。中に完全に収めるのがゴールです。"
      : "まずタンパク質を回して、よさそうなくぼみを探してください。";
  } catch (error) {
    message.textContent = "構造ファイルを読み込めません。ローカルサーバーから開いてください。";
    console.error(error);
  }
}

function buildStageButtons() {
  stageButtonsEl.innerHTML = "";
  STAGES.forEach((stage, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage";
    button.dataset.stage = String(index);
    button.addEventListener("click", () => loadStage(index));
    stageButtonsEl.appendChild(button);
  });
  updateStageButtons();
}

function updateStageButtons() {
  stageButtonsEl.querySelectorAll("button.stage").forEach((button) => {
    const index = Number(button.dataset.stage);
    const stage = STAGES[index];
    const record = state.records[stage.id];
    const best = record && Number.isFinite(record.bestScore)
      ? ` <span class="stage-clear">★${record.bestScore}</span>`
      : "";
    button.innerHTML = stage.title + best;
    button.classList.toggle("active", index === state.stageIndex);
  });
}

function bindEvents() {
  modeButtons.view.addEventListener("click", () => setMode("view"));
  modeButtons.move.addEventListener("click", () => setMode("move"));
  modeButtons.rotate.addEventListener("click", () => setMode("rotate"));

  resetButton.addEventListener("click", () => {
    resetPose();
    clearScore();
    resetTimer(STAGES[state.stageIndex].timeLimit);
    clearSessionRecords();
    closeNameEntry();
  });

  scoreButton.addEventListener("click", doJudge);
  scoreButtonFloat.addEventListener("click", doJudge);

  hintButton.addEventListener("click", () => {
    state.showHints = !state.showHints;
    hintButton.textContent = state.showHints ? "くぼみ候補を隠す" : "くぼみ候補を表示";
    redrawSceneExtras();
  });

  answerButton.addEventListener("click", showAnswer);
  spotHintButton.addEventListener("click", showSpotHint);

  depthSlider.addEventListener("input", () => {
    maybeStartTimer();
    state.pose.tz = state.depthBase + Number(depthSlider.value);
    redrawSceneExtras();
  });

  interactionLayer.addEventListener("wheel", (event) => {
    if (state.mode !== "move") return;
    event.preventDefault();
    maybeStartTimer();
    moveAlongNearestSurface(event.deltaY > 0 ? -2.0 : 2.0);
    redrawSceneExtras();
  }, { passive: false });

  interactionLayer.addEventListener("pointerdown", (event) => {
    maybeStartTimer();
    state.dragging = true;
    state.last = { x: event.clientX, y: event.clientY };
    interactionLayer.classList.add("dragging");
    interactionLayer.setPointerCapture(event.pointerId);
  });

  interactionLayer.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.last.x;
    const dy = event.clientY - state.last.y;
    state.last = { x: event.clientX, y: event.clientY };

    if (state.mode === "move") {
      const offset = screenOffsetToModel(dx, dy);
      state.pose.tx += offset.x;
      state.pose.ty += offset.y;
      state.pose.tz += offset.z;
      syncDepthSlider();
    } else if (state.mode === "rotate") {
      applyTrackball(dx, dy);
    }
    redrawSceneExtras();
  });

  interactionLayer.addEventListener("pointerup", (event) => {
    state.dragging = false;
    interactionLayer.classList.remove("dragging");
    interactionLayer.releasePointerCapture(event.pointerId);
  });

  document.querySelectorAll("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      maybeStartTimer();
      const action = button.dataset.nudge;
      if (action === "up") moveByScreenOffset(0, -28);
      if (action === "down") moveByScreenOffset(0, 28);
      if (action === "left") moveByScreenOffset(-28, 0);
      if (action === "right") moveByScreenOffset(28, 0);
      syncDepthSlider();
      redrawSceneExtras();
    });
  });

  document.querySelectorAll(".letter-up").forEach((button) => {
    button.addEventListener("click", () => cycleNameLetter(Number(button.dataset.slot), 1));
  });
  document.querySelectorAll(".letter-down").forEach((button) => {
    button.addEventListener("click", () => cycleNameLetter(Number(button.dataset.slot), -1));
  });
  nameEntryConfirm.addEventListener("click", confirmNameEntry);
  nameEntrySkip.addEventListener("click", skipNameEntry);

  window.addEventListener("resize", () => resizeConfetti());
}

function setMode(mode) {
  state.mode = mode;
  Object.entries(modeButtons).forEach(([key, button]) => {
    button.classList.toggle("active", key === mode);
  });
  interactionLayer.classList.toggle("active", mode !== "view");
  if (mode === "view") message.textContent = "タンパク質を回して、くぼみの位置を探してください。";
  if (mode === "move") message.textContent = "ドラッグで見た目どおりに移動します。ホイールで表面へ近づけたり離したりできます。";
  if (mode === "rotate") message.textContent = "ドラッグで低分子の向きを変えます。";
}

function defaultPose() {
  const dir = normalize({ x: 1, y: 0.35, z: 0.2 });
  const reach = state.proteinRadius + 10;
  return {
    tx: state.proteinCenter.x + dir.x * reach,
    ty: state.proteinCenter.y + dir.y * reach,
    tz: state.proteinCenter.z + dir.z * reach,
    R: eulerToMatrix(0.2, -0.6, 0.1),
  };
}

function resetPose() {
  state.answerMarker = null;
  state.spotHints = [];
  state.pose = defaultPose();
  snapLigandToSurface(13.0);
  state.depthBase = state.pose.tz;
  depthSlider.value = "0";
  redrawSceneExtras();
}

function syncDepthSlider() {
  const offset = clamp(Math.round(state.pose.tz - state.depthBase), -35, 35);
  depthSlider.value = String(offset);
}

function moveByScreenOffset(dx, dy) {
  const offset = screenOffsetToModel(dx, dy);
  state.pose.tx += offset.x;
  state.pose.ty += offset.y;
  state.pose.tz += offset.z;
}

function screenOffsetToModel(dx, dy) {
  if (!state.viewer || typeof state.viewer.screenOffsetToModel !== "function") {
    return { x: dx * 0.08, y: -dy * 0.08, z: 0 };
  }
  const offset = state.viewer.screenOffsetToModel(dx, dy);
  return {
    x: Number.isFinite(offset.x) ? offset.x : dx * 0.08,
    y: Number.isFinite(offset.y) ? offset.y : -dy * 0.08,
    z: Number.isFinite(offset.z) ? offset.z : 0,
  };
}

function snapLigandToSurface(targetDistance) {
  const nearest = nearestProteinAtom(state.pose);
  if (!nearest) return;
  let direction = normalize({
    x: state.pose.tx - nearest.x,
    y: state.pose.ty - nearest.y,
    z: state.pose.tz - nearest.z,
  });
  if (length3d(direction) < 0.001) {
    direction = normalize({
      x: nearest.x - state.proteinCenter.x,
      y: nearest.y - state.proteinCenter.y,
      z: nearest.z - state.proteinCenter.z,
    });
  }
  let distance = targetDistance;
  for (let i = 0; i < 18; i++) {
    state.pose.tx = nearest.x + direction.x * distance;
    state.pose.ty = nearest.y + direction.y * distance;
    state.pose.tz = nearest.z + direction.z * distance;
    if (countLigandCollisions() === 0) break;
    distance += 1.0;
  }
}

function moveAlongNearestSurface(amount) {
  const nearest = nearestProteinAtom(state.pose);
  if (!nearest) return;
  const direction = normalize({
    x: state.pose.tx - nearest.x,
    y: state.pose.ty - nearest.y,
    z: state.pose.tz - nearest.z,
  });
  state.pose.tx += direction.x * amount;
  state.pose.ty += direction.y * amount;
  state.pose.tz += direction.z * amount;
  syncDepthSlider();
}

function nearestProteinAtom(point) {
  let best = null;
  let bestDistance = Infinity;
  for (const atom of state.proteinAtoms) {
    const d = Math.hypot(point.tx - atom.x, point.ty - atom.y, point.tz - atom.z);
    if (d < bestDistance) {
      best = atom;
      bestDistance = d;
    }
  }
  return best;
}

function normalize(point) {
  const len = length3d(point);
  if (len < 0.001) return { x: 0, y: 0, z: 0 };
  return { x: point.x / len, y: point.y / len, z: point.z / len };
}

function length3d(point) {
  return Math.hypot(point.x, point.y, point.z);
}

function redrawSceneExtras() {
  if (!state.viewer || !state.ligandTemplate) return;
  state.viewer.removeAllShapes();
  if (typeof state.viewer.removeAllLabels === "function") state.viewer.removeAllLabels();
  if (state.showHints) drawPocketHints();
  if (state.answerMarker) drawAnswerMarker();
  if (state.spotHints.length) drawSpotHint();
  drawLigand();
  state.viewer.render();
}

function drawLigand() {
  const atoms = transformedLigandAtoms();

  for (const bond of state.ligandTemplate.bonds) {
    const a = atoms[bond.a - 1];
    const b = atoms[bond.b - 1];
    if (!a || !b) continue;
    const radius = bond.order > 1 ? 0.11 : 0.09;
    state.viewer.addCylinder({
      start: { x: a.x, y: a.y, z: a.z },
      end: { x: b.x, y: b.y, z: b.z },
      radius,
      color: "0xe6d7b0",
      fromCap: true,
      toCap: true,
    });
  }

  for (const atom of atoms) {
    const color = atomColors[atom.element] || "0xbec7d5";
    const radius = atom.element === "H" ? 0.22 : atom.element === "O" ? 0.36 : 0.34;
    state.viewer.addSphere({
      center: { x: atom.x, y: atom.y, z: atom.z },
      radius,
      color,
    });
  }
}

function drawPocketHints() {
  for (const [index, hint] of state.pocketHints.slice(0, 8).entries()) {
    state.viewer.addSphere({
      center: { x: hint.x, y: hint.y, z: hint.z },
      radius: 2.2,
      color: "0x52d185",
      alpha: 0.42,
      wireframe: true,
    });
    state.viewer.addLabel(String(index + 1), {
      position: { x: hint.x, y: hint.y, z: hint.z },
      fontColor: "white",
      backgroundColor: "0x1f8f56",
      backgroundOpacity: 0.85,
      fontSize: 14,
      inFront: true,
    });
  }
}

// --- 正解（実際の結合部位）機能 ---

function parseAnswerSites(text, kind, hetCode) {
  const sites = [];
  const lines = text.split(/\r?\n/);
  if (kind === "hetsite") {
    // 指定したHETATM（結合しているリガンド）の位置＝実際の結合ポケット
    const acc = {};
    for (const line of lines) {
      if (!line.startsWith("HETATM")) continue;
      const c = line.trim().split(/\s+/);
      if (c[5] !== hetCode) continue;
      const key = c[6];
      const a = acc[key] || (acc[key] = { x: 0, y: 0, z: 0, n: 0 });
      a.x += Number(c[10]);
      a.y += Number(c[11]);
      a.z += Number(c[12]);
      a.n += 1;
    }
    for (const key in acc) {
      const a = acc[key];
      if (a.n > 0) sites.push({ x: a.x / a.n, y: a.y / a.n, z: a.z / a.n });
    }
    return sites;
  }
  if (kind === "iron") {
    for (const line of lines) {
      if (!line.startsWith("HETATM")) continue;
      const c = line.trim().split(/\s+/);
      if (c[5] === "FE") {
        const p = { x: Number(c[10]), y: Number(c[11]), z: Number(c[12]) };
        if (Number.isFinite(p.x)) sites.push(p);
      }
    }
    return sites;
  }
  if (kind === "ctb") {
    // Bサブユニット（TRP88を持つ鎖）のGM1結合残基から各ポケットの中心を求める
    const wanted = new Set([51, 56, 88, 90, 91]);
    const acc = {};
    const hasTrp88 = {};
    for (const line of lines) {
      if (!line.startsWith("ATOM")) continue;
      const c = line.trim().split(/\s+/);
      const asym = c[6];
      const seq = parseInt(c[8], 10);
      if (c[5] === "TRP" && seq === 88) hasTrp88[asym] = true;
      if (wanted.has(seq)) {
        const a = acc[asym] || (acc[asym] = { x: 0, y: 0, z: 0, n: 0 });
        a.x += Number(c[10]);
        a.y += Number(c[11]);
        a.z += Number(c[12]);
        a.n += 1;
      }
    }
    for (const asym in acc) {
      if (!hasTrp88[asym]) continue;
      const a = acc[asym];
      if (a.n > 0) sites.push({ x: a.x / a.n, y: a.y / a.n, z: a.z / a.n });
    }
    return sites;
  }
  return sites;
}

function showAnswer() {
  const stage = STAGES[state.stageIndex];
  answerButton.disabled = true;
  message.textContent = "正解を計算中…";
  // メッセージを描画させてから重い計算を実行
  setTimeout(() => {
    if (stage.answerKind === "pocket" && !state.answerSites.length) {
      state.answerSites = computeGoodPockets(5);
    }
    revealAnswer(stage);
    answerButton.disabled = false;
  }, 20);
}

function revealAnswer(stage) {
  if (!state.answerSites.length) {
    message.textContent = "この構造では正解位置が見つかりませんでした。";
    return;
  }
  const site = state.answerSites[Math.floor(Math.random() * state.answerSites.length)];
  seatLigandAt(site);
  state.answerMarker = site;
  redrawSceneExtras();

  const score = scoreLigand();
  floatScoreNum.textContent = String(score.total);
  floatScoreLabel.textContent = "お手本の位置";
  scoreNumber.textContent = String(score.total);
  scoreLabel.textContent = "お手本（正解の一例）";
  message.textContent = (stage.answerNote || "実際の結合部位の一例です。") +
    " 向きや奥行きを微調整すると、さらに高得点を狙えます。";
}

function computeGoodPockets(maxSites) {
  const cas = state.proteinAtoms.filter((atom) => atom.name === "CA");
  if (!cas.length) return [];
  const saved = { ...state.pose };
  const step = Math.max(1, Math.floor(cas.length / 90));
  const scored = [];
  for (let i = 0; i < cas.length; i += step) {
    const seed = cas[i];
    const dir = normalize({
      x: seed.x - state.proteinCenter.x,
      y: seed.y - state.proteinCenter.y,
      z: seed.z - state.proteinCenter.z,
    });
    let best = -1;
    for (const dist of [4, 5.5]) {
      for (const ry of [0, 3.14]) {
        state.pose.R = eulerToMatrix(0.4, ry, 0);
        state.pose.tx = seed.x + dir.x * dist;
        state.pose.ty = seed.y + dir.y * dist;
        state.pose.tz = seed.z + dir.z * dist;
        const sc = scoreLigand().total;
        if (sc > best) best = sc;
      }
    }
    if (best >= 45) scored.push({ x: seed.x, y: seed.y, z: seed.z, score: best });
  }
  state.pose = saved;
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  for (const s of scored) {
    if (out.every((o) => distance3d(o, s) >= 12)) out.push(s);
    if (out.length >= maxSites) break;
  }
  return out;
}

function seatLigandAt(site) {
  const dir = normalize({
    x: site.x - state.proteinCenter.x,
    y: site.y - state.proteinCenter.y,
    z: site.z - state.proteinCenter.z,
  });
  // 探索中はサイト近傍の原子だけで判定して高速化（遠い原子はカットオフ外で寄与しない）
  const fullAtoms = state.proteinAtoms;
  const radius = (state.ligandMaxRadius || 12) + 7 + 9;
  const local = fullAtoms.filter((a) => distance3d(a, site) < radius);
  state.proteinAtoms = local.length ? local : fullAtoms;
  let best = null;
  let bestScore = -1;
  for (const ry of [0, 1.05, 2.09, 3.14, 4.19, 5.24]) {
    for (const rx of [0, 1.57, 3.14, 4.71]) {
      for (const rz of [0, 1.6, 3.1]) {
        for (const dist of [2, 3, 4, 5, 6, 7]) {
          state.pose.R = eulerToMatrix(rx, ry, rz);
          state.pose.tx = site.x + dir.x * dist;
          state.pose.ty = site.y + dir.y * dist;
          state.pose.tz = site.z + dir.z * dist;
          const sc = scoreLigand();
          // 見た目重視: めり込み（衝突）を強めに減点し、きれいに乗った姿勢を選ぶ
          const obj = sc.total - sc.collisions * 3 - sc.severeCollisions * 10;
          if (obj > bestScore) {
            bestScore = obj;
            best = { R: state.pose.R, tx: state.pose.tx, ty: state.pose.ty, tz: state.pose.tz };
          }
        }
      }
    }
  }
  state.proteinAtoms = fullAtoms;
  if (best) state.pose = best;
  state.depthBase = state.pose.tz;
  syncDepthSlider();
}

function drawAnswerMarker() {
  // ワイヤーフレームのみ（塗りつぶし球はsurface内部で黒く見えるため使わない）
  state.viewer.addSphere({
    center: state.answerMarker,
    radius: 4.6,
    color: "0x5fd0ff",
    alpha: 0.6,
    wireframe: true,
  });
}

function drawSpotHint() {
  // 「ここだよ！」の赤い場所ヒント（ワイヤーフレームで黒球化を回避）
  // 正解サイトが複数ある場合（例: 対称な結合部位が2箇所以上）は、そのすべてに印を付ける
  for (const spot of state.spotHints) {
    state.viewer.addSphere({
      center: spot,
      radius: 5.0,
      color: "0xff4d4d",
      alpha: 0.65,
      wireframe: true,
    });
  }
}

function showSpotHint() {
  const stage = STAGES[state.stageIndex];
  spotHintButton.disabled = true;
  message.textContent = "ヒントを準備中…";
  setTimeout(() => {
    if (stage.answerKind === "pocket" && !state.answerSites.length) {
      state.answerSites = computeGoodPockets(5);
    }
    if (!state.answerSites.length) {
      message.textContent = "ヒント位置が見つかりませんでした。";
      spotHintButton.disabled = false;
      return;
    }
    // pocket型は緑の候補表示と役割が重複するため代表1点のみ。
    // hetsite/ctb型は実在する正解サイトなので、複数あればすべて表示する（対称な結合部位を見落とさないように）。
    state.spotHints = stage.answerKind === "pocket"
      ? [state.answerSites[0]]
      : state.answerSites.slice();
    redrawSceneExtras();
    message.textContent = state.spotHints.length > 1
      ? `赤い印が${state.spotHints.length}箇所あります。どれか1つに低分子を動かしてみよう！ 場所が合えば得点が上がります。`
      : "赤い印のあたりに低分子を動かしてみよう！ 場所が合えば得点が上がります。";
    spotHintButton.disabled = false;
  }, 20);
}

function parseCifAtoms(text) {
  const atoms = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("ATOM")) continue;
    const c = line.trim().split(/\s+/);
    const atom = {
      element: c[2],
      name: c[3],
      residue: c[5],
      x: Number(c[10]),
      y: Number(c[11]),
      z: Number(c[12]),
    };
    if (Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z)) atoms.push(atom);
  }
  return atoms;
}

function parseSdf(text) {
  const lines = text.split(/\r?\n/);
  const counts = lines[3].trim().split(/\s+/);
  const atomCount = Number(counts[0]);
  const bondCount = Number(counts[1]);
  const atoms = [];
  const bonds = [];

  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    atoms.push({
      x: Number(line.slice(0, 10)),
      y: Number(line.slice(10, 20)),
      z: Number(line.slice(20, 30)),
      element: line.slice(31, 34).trim(),
    });
  }

  for (let i = 0; i < bondCount; i++) {
    const line = lines[4 + atomCount + i];
    bonds.push({
      a: Number(line.slice(0, 3)),
      b: Number(line.slice(3, 6)),
      order: Number(line.slice(6, 9)),
    });
  }

  const center = centroid(atoms);
  return {
    atoms: atoms.map((atom) => ({
      ...atom,
      x: atom.x - center.x,
      y: atom.y - center.y,
      z: atom.z - center.z,
    })),
    bonds,
  };
}

function transformedLigandAtoms() {
  return state.ligandTemplate.atoms.map((atom) => {
    const p = matVec(state.pose.R, atom);
    return {
      ...atom,
      x: p.x + state.pose.tx,
      y: p.y + state.pose.ty,
      z: p.z + state.pose.tz,
    };
  });
}

function rotatePoint(point, rx, ry, rz) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  const y1 = point.y * cx - point.z * sx;
  const z1 = point.y * sx + point.z * cx;
  const x1 = point.x;

  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  return {
    x: x2 * cz - y2 * sz,
    y: x2 * sz + y2 * cz,
    z: z2,
  };
}

// --- 回転（トラックボール）用の行列ユーティリティ ---

function eulerToMatrix(rx, ry, rz) {
  // rotatePoint と同じ姿勢を 3x3 行列（行優先）で表す
  const c0 = rotatePoint({ x: 1, y: 0, z: 0 }, rx, ry, rz);
  const c1 = rotatePoint({ x: 0, y: 1, z: 0 }, rx, ry, rz);
  const c2 = rotatePoint({ x: 0, y: 0, z: 1 }, rx, ry, rz);
  return [c0.x, c1.x, c2.x, c0.y, c1.y, c2.y, c0.z, c1.z, c2.z];
}

function matVec(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

function axisAngleToMatrix(ax, ay, az, angle) {
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len; ay /= len; az /= len;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}

function cameraQuatConjugate() {
  // 3Dmol のシーン回転クォータニオンを取得し、逆（共役）を返す
  if (!state.viewer || typeof state.viewer.getView !== "function") return null;
  const v = state.viewer.getView();
  if (!v || v.length < 8) return null;
  const qx = v[4], qy = v[5], qz = v[6], qw = v[7];
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  return { x: -qx / n, y: -qy / n, z: -qz / n, w: qw / n };
}

function quatRotateVec(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function applyTrackball(dx, dy) {
  // ドラッグ方向を「画面基準の軸」に対応させて、低分子の中心まわりに自由回転する
  let right = { x: 1, y: 0, z: 0 };
  let up = { x: 0, y: 1, z: 0 };
  const q = cameraQuatConjugate();
  if (q) {
    right = quatRotateVec(q, { x: 1, y: 0, z: 0 });
    up = quatRotateVec(q, { x: 0, y: 1, z: 0 });
  }
  const speed = 0.01;
  const rotYaw = axisAngleToMatrix(up.x, up.y, up.z, dx * speed);
  const rotPitch = axisAngleToMatrix(right.x, right.y, right.z, dy * speed);
  state.pose.R = matMul(matMul(rotPitch, rotYaw), state.pose.R);
}

function hasSolventAccess(ligandAtoms) {
  // 低分子の重心から「タンパク質中心の反対方向＝想定される溶媒側」へ抜けられるかを確認する。
  // 直接の原子衝突（collisions/severeCollisions）がなくても、その先まで
  // タンパク質原子で埋め尽くされている場合は「表面のくぼみ」ではなく
  // 「内部に完全に埋もれた空隙」とみなし、高得点にならないようにする。
  const ligandCenter = centroid(ligandAtoms);
  const outward = normalize({
    x: ligandCenter.x - state.proteinCenter.x,
    y: ligandCenter.y - state.proteinCenter.y,
    z: ligandCenter.z - state.proteinCenter.z,
  });
  // タンパク質のほぼ中心＝内部の芯にいる場合は方向が定まらないため、抜け道なしとみなす
  if (outward.x === 0 && outward.y === 0 && outward.z === 0) return false;

  const reach = (state.ligandMaxRadius || 6) + 6;
  const escapePoint = {
    x: ligandCenter.x + outward.x * reach,
    y: ligandCenter.y + outward.y * reach,
    z: ligandCenter.z + outward.z * reach,
  };
  let nearby = 0;
  for (const atom of state.proteinAtoms) {
    if (distance3d(atom, escapePoint) < 5) {
      nearby += 1;
      if (nearby > 6) return false;
    }
  }
  return true;
}

function scoreLigand() {
  const stage = STAGES[state.stageIndex];
  const buried = stage.mode === "buried";
  const heavy = state.ligandHeavyCount;
  const ligandAtoms = transformedLigandAtoms().filter((atom) => atom.element !== "H");
  let collisions = 0;
  let contacts = 0;
  let shellAtoms = 0;
  let severeCollisions = 0;
  let minDistance = Infinity;

  for (const ligand of ligandAtoms) {
    for (const protein of state.proteinAtoms) {
      const d = distance3d(ligand, protein);
      if (d < minDistance) minDistance = d;
      if (d < 1.45) severeCollisions += 1;
      if (d < 2.1) collisions += 1;
      if (d >= 2.2 && d <= 4.8) contacts += 1;
      if (d >= 3.8 && d <= 8.2) shellAtoms += 1;
    }
  }

  const minContacts = Math.max(4, Math.round(heavy * 0.35));
  const collisionCap = Math.round(heavy * 1.9);

  if (minDistance > 8.5 || contacts < minContacts) {
    return zeroScore("外れています", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }
  if (severeCollisions > 3 || collisions > collisionCap) {
    return zeroScore("内部に埋もれすぎ", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }
  const solventOk = hasSolventAccess(ligandAtoms);
  if (buried ? solventOk : !solventOk) {
    return zeroScore(
      buried ? "表面にはみ出しています（完全に埋め込んで）" : "内部に埋もれすぎ",
      { minDistance, collisions, severeCollisions, contacts, shellAtoms }
    );
  }

  const enclosureScore = Math.round(clamp(shellAtoms / (heavy * 0.85), 0, 45));
  const contactScore = Math.round(clamp(contacts / (heavy * 0.38), 0, 35));
  const collisionScore = Math.round(clamp(20 - collisions * 1.4 - severeCollisions * 4, 0, 20));
  if (contactScore < 5) {
    return zeroScore("外れています", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }
  if (collisionScore === 0) {
    return zeroScore("内部に埋もれすぎ", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }
  const total = Math.round(clamp(enclosureScore + contactScore + collisionScore, 0, 100));
  return {
    total,
    enclosureScore,
    contactScore,
    collisionScore,
    collisions,
    severeCollisions,
    contacts,
    minDistance,
    reason: labelForScore(total, collisions, severeCollisions, stage.clearThreshold || CLEAR_THRESHOLD),
  };
}

function zeroScore(reason, details) {
  return {
    total: 0,
    enclosureScore: 0,
    contactScore: 0,
    collisionScore: 0,
    collisions: details.collisions,
    severeCollisions: details.severeCollisions,
    contacts: details.contacts,
    minDistance: details.minDistance,
    reason,
  };
}

function countLigandCollisions() {
  if (!state.ligandTemplate || !state.proteinAtoms.length) return 0;
  const ligandAtoms = transformedLigandAtoms().filter((atom) => atom.element !== "H");
  let collisions = 0;
  for (const ligand of ligandAtoms) {
    for (const protein of state.proteinAtoms) {
      if (distance3d(ligand, protein) < 2.0) collisions += 1;
    }
  }
  return collisions;
}

function doJudge() {
  ensureAudio();
  const score = scoreLigand();
  renderScore(score);
}

function renderScore(score) {
  scoreNumber.textContent = String(score.total);
  scoreLabel.textContent = score.reason;
  floatScoreNum.textContent = String(score.total);
  floatScoreLabel.textContent = score.reason;
  enclosureScoreEl.textContent = `${score.enclosureScore}/45`;
  collisionScoreEl.textContent = `${score.collisionScore}/20`;
  contactScoreEl.textContent = `${score.contactScore}/35`;
  if (score.total === 0) {
    playFail();
    message.textContent = score.reason === "外れています"
      ? "低分子が表面から離れすぎています。表面へ吸着してから、くぼみの近くへ動かしてください。"
      : "低分子がタンパク質の内部に入り込みすぎています。外へ出してから置き直してください。";
    return;
  }
  const threshold = STAGES[state.stageIndex].clearThreshold || CLEAR_THRESHOLD;
  if (score.total >= threshold) {
    const stage = STAGES[state.stageIndex];
    const firstClear = !state.cleared[stage.id];
    state.cleared[stage.id] = true;
    const clearTime = state.timerRunning ? state.timeLimit - state.timeLeft : null;
    const updated = recordResult(stage.id, score.total, clearTime);
    stopTimer();
    updateStageButtons();
    renderRecords();
    celebrate(score.total, firstClear);
    let note = firstClear
      ? "ステージクリア！ 別のステージや低分子にも挑戦してみよう。"
      : "きれいにハマりました。さらに高得点を狙えるかも。";
    if (updated.newBestScore) note = "ハイスコア更新！ " + note;
    else if (updated.newBestTime) note = "ベストタイム更新！ " + note;
    message.textContent = note;
    if (qualifiesForLeaderboard(stage.id, score.total, clearTime)) {
      scheduleNameEntry(stage.id, score.total, clearTime);
    }
    return;
  }
  playFail();
  message.textContent = "表面に近く、めり込みが少なく、周囲にタンパク質がある配置ほど高得点です。";
}

function clearScore() {
  scoreNumber.textContent = "--";
  scoreLabel.textContent = "まだ判定していません";
  floatScoreNum.textContent = "--";
  floatScoreLabel.textContent = "判定を押してね";
  enclosureScoreEl.textContent = "--";
  collisionScoreEl.textContent = "--";
  contactScoreEl.textContent = "--";
  message.textContent = "まずタンパク質を回して、よさそうなくぼみを探してください。";
}

function labelForScore(score, collisions, severeCollisions, threshold) {
  if (severeCollisions > 1 || collisions > 14) return "少しめり込み";
  if (score >= threshold + 30) return "かなりハマっている";
  if (score >= threshold) return "入りそう";
  if (score >= threshold - 15) return "あと少し";
  return "別のくぼみを探そう";
}

function buildPocketHints(atoms) {
  const caAtoms = atoms.filter((atom) => atom.name === "CA");
  const candidates = [];
  for (let i = 0; i < caAtoms.length; i += 14) {
    const base = caAtoms[i];
    let shell = 0;
    let close = 0;
    for (const atom of atoms) {
      const d = distance3d(base, atom);
      if (d >= 5 && d <= 11) shell += 1;
      if (d < 4) close += 1;
    }
    const score = shell - close * 2;
    if (score > 22) candidates.push({ x: base.x, y: base.y, z: base.z, score });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((candidate, index, list) => list.findIndex((other) => distance3d(candidate, other) < 12) === index);
}

function centroid(points) {
  const sum = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
      z: acc.z + point.z,
    }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

function boundingRadius(points, center) {
  let max = 0;
  for (const point of points) {
    const d = distance3d(point, center);
    if (d > max) max = d;
  }
  return max;
}

function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- 制限時間 ---

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function resetTimer(limit) {
  stopTimer();
  state.timeLimit = limit;
  state.timeLeft = limit;
  state.timerRunning = false;
  state.timedOut = false;
  hudTimerEl.classList.remove("running", "low", "timeout");
  hudTimerValueEl.textContent = formatTime(limit);
}

function maybeStartTimer() {
  if (state.timerRunning || state.timedOut) return;
  state.timerRunning = true;
  hudTimerEl.classList.add("running");
  state.timer = window.setInterval(tickTimer, 1000);
}

function tickTimer() {
  state.timeLeft -= 1;
  if (state.timeLeft <= 10) hudTimerEl.classList.add("low");
  hudTimerValueEl.textContent = formatTime(state.timeLeft);
  if (state.timeLeft <= 0) onTimeout();
}

function stopTimer() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  state.timerRunning = false;
}

function onTimeout() {
  stopTimer();
  state.timedOut = true;
  state.timeLeft = 0;
  hudTimerValueEl.textContent = "0:00";
  hudTimerEl.classList.remove("running", "low");
  hudTimerEl.classList.add("timeout");
  playFail();
  message.textContent = "時間切れ！ リセットしてもう一度挑戦しよう。";
}

// --- ハイスコア記録（localStorage） ---

function loadRecords() {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function saveRecords() {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(state.records));
  } catch (error) {
    // localStorageが使えない環境では記録を保持しないだけ
  }
}

function recordResult(stageId, score, clearTimeSec) {
  const current = state.records[stageId] || { bestScore: 0, bestTimeSec: null };
  const result = { newBestScore: false, newBestTime: false };
  if (score > current.bestScore) {
    current.bestScore = score;
    result.newBestScore = true;
  }
  if (clearTimeSec != null && (current.bestTimeSec == null || clearTimeSec < current.bestTimeSec)) {
    current.bestTimeSec = clearTimeSec;
    result.newBestTime = true;
  }
  state.records[stageId] = current;
  saveRecords();
  return result;
}

function renderRecords() {
  const stage = STAGES[state.stageIndex];
  const record = state.records[stage.id];
  bestScoreEl.textContent = record && record.bestScore ? String(record.bestScore) : "--";
  bestTimeEl.textContent = record && record.bestTimeSec != null ? formatTime(record.bestTimeSec) : "--";
}

function clearSessionRecords() {
  state.records = {};
  saveRecords();
  updateStageButtons();
  renderRecords();
}

// --- ランキング（ステージ別・消えない最高記録） ---

function sortLeaderboardEntries(entries) {
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = a.timeSec == null ? Infinity : a.timeSec;
    const tb = b.timeSec == null ? Infinity : b.timeSec;
    return ta - tb;
  });
  return entries;
}

function loadLeaderboard() {
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data)) {
      // 旧形式（全ステージ混在の配列）をステージ別オブジェクトへ変換
      const migrated = {};
      for (const entry of data) {
        const stage = STAGES.find((s) => s.title === entry.stage);
        const key = stage ? stage.id : entry.stage;
        if (!migrated[key]) migrated[key] = [];
        migrated[key].push({ score: entry.score, timeSec: entry.timeSec == null ? null : entry.timeSec });
      }
      for (const key of Object.keys(migrated)) {
        migrated[key] = sortLeaderboardEntries(migrated[key]).slice(0, LEADERBOARD_MAX);
      }
      return migrated;
    }
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    return {};
  }
}

function saveLeaderboard() {
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(state.leaderboard));
  } catch (error) {
    // localStorageが使えない環境では保持しないだけ
  }
}

function addToLeaderboard(stageId, score, timeSec, name) {
  if (!Array.isArray(state.leaderboard[stageId])) {
    state.leaderboard[stageId] = [];
  }
  state.leaderboard[stageId].push({
    score,
    timeSec: timeSec == null ? null : timeSec,
    name: name ? String(name).slice(0, 3) : null,
  });
  state.leaderboard[stageId] = sortLeaderboardEntries(state.leaderboard[stageId]).slice(0, LEADERBOARD_MAX);
  saveLeaderboard();
}

function qualifiesForLeaderboard(stageId, score, timeSec) {
  const entries = state.leaderboard[stageId] || [];
  if (entries.length < LEADERBOARD_MAX) return true;
  const worst = entries[entries.length - 1];
  if (score !== worst.score) return score > worst.score;
  if (timeSec == null) return false;
  if (worst.timeSec == null) return true;
  return timeSec < worst.timeSec;
}

function renderLeaderboard() {
  leaderboardEl.innerHTML = "";
  STAGES.forEach((stage) => {
    const group = document.createElement("div");
    group.className = "leaderboard-group";

    const heading = document.createElement("h3");
    heading.textContent = stage.title;
    group.appendChild(heading);

    const list = document.createElement("ol");
    list.className = "leaderboard";
    const entries = state.leaderboard[stage.id] || [];

    if (!entries.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "まだ記録がありません";
      list.appendChild(li);
    } else {
      for (const entry of entries) {
        const li = document.createElement("li");
        if (entry.name) {
          const nameSpan = document.createElement("span");
          nameSpan.className = "lb-name";
          nameSpan.textContent = entry.name;
          li.appendChild(nameSpan);
        }
        const scoreSpan = document.createElement("span");
        scoreSpan.className = "lb-score";
        scoreSpan.textContent = `${entry.score}点`;
        const timeSpan = document.createElement("span");
        timeSpan.className = "lb-time";
        timeSpan.textContent = entry.timeSec == null ? "" : formatTime(entry.timeSec);
        li.appendChild(scoreSpan);
        li.appendChild(timeSpan);
        list.appendChild(li);
      }
    }

    group.appendChild(list);
    leaderboardEl.appendChild(group);
  });
}

// --- 名前登録（レトロアーケード風の3文字イニシャル入力） ---

const NAME_LETTERS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function scheduleNameEntry(stageId, score, timeSec) {
  // 成功演出（紙吹雪・回転）が一段落してから、右パネルに登録欄を出す
  clearNameEntryTimer();
  state.nameEntryTimer = window.setTimeout(() => {
    state.nameEntryTimer = null;
    openNameEntry(stageId, score, timeSec);
  }, 2600);
}

function clearNameEntryTimer() {
  if (state.nameEntryTimer) {
    window.clearTimeout(state.nameEntryTimer);
    state.nameEntryTimer = null;
  }
}

function openNameEntry(stageId, score, timeSec) {
  state.nameEntry = { stageId, score, timeSec, letters: ["A", "A", "A"] };
  renderNameEntryLetters();
  nameEntryModal.classList.remove("hidden");
  nameEntryModal.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeNameEntry() {
  clearNameEntryTimer();
  nameEntryModal.classList.add("hidden");
  state.nameEntry = null;
}

function renderNameEntryLetters() {
  if (!state.nameEntry) return;
  nameLetterEls.forEach((el, i) => {
    const letter = state.nameEntry.letters[i];
    el.textContent = letter === " " ? "_" : letter;
  });
}

function cycleNameLetter(slot, dir) {
  if (!state.nameEntry) return;
  const current = state.nameEntry.letters[slot];
  let idx = NAME_LETTERS.indexOf(current);
  if (idx < 0) idx = 0;
  idx = (idx + dir + NAME_LETTERS.length) % NAME_LETTERS.length;
  state.nameEntry.letters[slot] = NAME_LETTERS[idx];
  renderNameEntryLetters();
}

function confirmNameEntry() {
  if (!state.nameEntry) return;
  const { stageId, score, timeSec, letters } = state.nameEntry;
  const name = letters.join("").trim();
  addToLeaderboard(stageId, score, timeSec, name || null);
  renderLeaderboard();
  closeNameEntry();
}

function skipNameEntry() {
  if (!state.nameEntry) return;
  const { stageId, score, timeSec } = state.nameEntry;
  addToLeaderboard(stageId, score, timeSec, null);
  renderLeaderboard();
  closeNameEntry();
}

// --- 成功演出（音・紙吹雪・回転） ---

function ensureAudio() {
  if (state.audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  state.audioCtx = new Ctx();
}

function playTone(frequency, startOffset, duration, gainPeak) {
  const ctx = state.audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playSuccess(total) {
  ensureAudio();
  if (!state.audioCtx) return;
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
  const notes = total >= 82 ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => playTone(freq, i * 0.12, 0.5, 0.22));
}

function playFail() {
  ensureAudio();
  if (!state.audioCtx) return;
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
  playTone(220, 0, 0.18, 0.14);
  playTone(174.6, 0.14, 0.24, 0.14);
}

function celebrate(total, firstClear) {
  playSuccess(total);
  [scoreNumber, floatScoreNum].forEach((el) => {
    el.classList.remove("celebrate");
    void el.offsetWidth;
    el.classList.add("celebrate");
  });

  celebrateBanner.textContent = total >= 82 ? "ピッタリ！" : "ナイスドッキング！";
  celebrateBanner.classList.remove("show");
  void celebrateBanner.offsetWidth;
  celebrateBanner.classList.add("show");

  launchConfetti(firstClear ? 160 : 90);

  if (state.viewer && typeof state.viewer.spin === "function") {
    state.viewer.spin("y", 1);
    window.setTimeout(() => state.viewer.spin(false), 2200);
  }
}

let confettiRaf = null;

function resizeConfetti() {
  const rect = confettiCanvas.getBoundingClientRect();
  confettiCanvas.width = Math.max(1, Math.floor(rect.width));
  confettiCanvas.height = Math.max(1, Math.floor(rect.height));
}

function launchConfetti(count) {
  resizeConfetti();
  const ctx = confettiCanvas.getContext("2d");
  if (!ctx) return;
  const colors = ["#f3b23c", "#52d185", "#5fa8ff", "#e65a4f", "#f6f2ea"];
  const w = confettiCanvas.width;
  const h = confettiCanvas.height;
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    });
  }

  confettiCanvas.classList.add("show");
  const start = performance.now();
  if (confettiRaf) cancelAnimationFrame(confettiRaf);

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = clamp(1 - elapsed / 2200, 0, 1);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (elapsed < 2200) {
      confettiRaf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, w, h);
      confettiCanvas.classList.remove("show");
      confettiRaf = null;
    }
  }
  confettiRaf = requestAnimationFrame(frame);
}
