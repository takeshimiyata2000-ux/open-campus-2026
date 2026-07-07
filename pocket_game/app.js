const viewerEl = document.getElementById("viewer");
window.POCKET_APP_VERSION = "3dmol-surface-v1";
const interactionLayer = document.getElementById("interactionLayer");
const depthSlider = document.getElementById("depthSlider");
const resetButton = document.getElementById("resetButton");
const scoreButton = document.getElementById("scoreButton");
const hintButton = document.getElementById("hintButton");
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

const atomColors = {
  C: "0xf3b23c",
  O: "0xe65a4f",
  N: "0x5fa8ff",
  H: "0xf6f2ea",
  S: "0xf2d24b",
};

const state = {
  viewer: null,
  proteinAtoms: [],
  proteinCenter: { x: 0, y: 0, z: 0 },
  ligandTemplate: null,
  pocketHints: [],
  mode: "view",
  showHints: false,
  dragging: false,
  last: { x: 0, y: 0 },
  pose: {
    tx: 70,
    ty: 47,
    tz: 19,
    rx: 0.2,
    ry: -0.6,
    rz: 0.1,
  },
};

init();

async function init() {
  const mol3d = window.$3Dmol || window["3Dmol"];
  if (!mol3d) {
    message.textContent = "3Dmol.jsを読み込めません。3Dmol-min.jsの場所を確認してください。";
    return;
  }

  bindEvents();

  state.viewer = mol3d.createViewer(viewerEl, {
    backgroundColor: "black",
    antialias: true,
  });

  try {
    const [cifText, sdfText] = await Promise.all([
      fetch("../pdb_cache/1blf.cif").then((res) => res.text()),
      fetch("catechin.sdf").then((res) => res.text()),
    ]);

    state.proteinAtoms = parseCifAtoms(cifText);
    state.proteinCenter = centroid(state.proteinAtoms);
    state.pocketHints = buildPocketHints(state.proteinAtoms);
    state.ligandTemplate = parseSdf(sdfText);

    const proteinModel = state.viewer.addModel(cifText, "cif");
    proteinModel.setStyle({}, { cartoon: { color: "white", opacity: 0.18 } });
    state.viewer.addSurface(
      mol3d.SurfaceType.VDW,
      { color: "white", opacity: 0.82 },
      { model: proteinModel }
    );
    state.viewer.zoomTo();
    state.viewer.render();

    resetPose();
  } catch (error) {
    message.textContent = "構造ファイルを読み込めません。ローカルサーバーから開いてください。";
    console.error(error);
  }
}

function bindEvents() {
  modeButtons.view.addEventListener("click", () => setMode("view"));
  modeButtons.move.addEventListener("click", () => setMode("move"));
  modeButtons.rotate.addEventListener("click", () => setMode("rotate"));

  resetButton.addEventListener("click", () => {
    resetPose();
    clearScore();
  });

  scoreButton.addEventListener("click", () => {
    const score = scoreLigand();
    renderScore(score);
  });

  hintButton.addEventListener("click", () => {
    state.showHints = !state.showHints;
    hintButton.textContent = state.showHints ? "くぼみ候補を隠す" : "くぼみ候補を表示";
    redrawSceneExtras();
  });

  depthSlider.addEventListener("input", () => {
    state.pose.tz = Number(depthSlider.value) + 19;
    redrawSceneExtras();
  });

  interactionLayer.addEventListener("wheel", (event) => {
    if (state.mode !== "move") return;
    event.preventDefault();
    moveAlongNearestSurface(event.deltaY > 0 ? -2.0 : 2.0);
    redrawSceneExtras();
  }, { passive: false });

  interactionLayer.addEventListener("pointerdown", (event) => {
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
    } else if (state.mode === "rotate") {
      state.pose.ry += dx * 0.018;
      state.pose.rx += dy * 0.018;
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
      const action = button.dataset.nudge;
      if (action === "up") moveByScreenOffset(0, -28);
      if (action === "down") moveByScreenOffset(0, 28);
      if (action === "left") moveByScreenOffset(-28, 0);
      if (action === "right") moveByScreenOffset(28, 0);
      if (action === "snap") snapLigandToSurface(7.0);
      if (action === "out") snapLigandToSurface(13.0);
      depthSlider.value = String(Math.round(state.pose.tz - 19));
      redrawSceneExtras();
    });
  });
}

function setMode(mode) {
  state.mode = mode;
  Object.entries(modeButtons).forEach(([key, button]) => {
    button.classList.toggle("active", key === mode);
  });
  interactionLayer.classList.toggle("active", mode !== "view");
  if (mode === "view") message.textContent = "タンパク質を回して、くぼみの位置を探してください。";
  if (mode === "move") message.textContent = "ドラッグで見た目どおりに移動します。ホイールで表面へ近づけたり離したりできます。";
  if (mode === "rotate") message.textContent = "ドラッグでカテキンの向きを変えます。";
}

function resetPose() {
  state.pose = {
    tx: 76,
    ty: 47,
    tz: 24,
    rx: 0.2,
    ry: -0.6,
    rz: 0.1,
  };
  depthSlider.value = "0";
  snapLigandToSurface(13.0);
  depthSlider.value = String(Math.round(state.pose.tz - 19));
  redrawSceneExtras();
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
  depthSlider.value = String(Math.round(state.pose.tz - 19));
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
  drawLigand();
  state.viewer.render();
}

function drawLigand() {
  const atoms = transformedLigandAtoms();

  for (const bond of state.ligandTemplate.bonds) {
    const a = atoms[bond.a - 1];
    const b = atoms[bond.b - 1];
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
    const p = rotatePoint(atom, state.pose.rx, state.pose.ry, state.pose.rz);
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

function scoreLigand() {
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

  if (minDistance > 7.5 || contacts < 8) {
    return zeroScore("外れています", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }
  if (severeCollisions > 2 || collisions > 22) {
    return zeroScore("内部に埋もれすぎ", { minDistance, collisions, severeCollisions, contacts, shellAtoms });
  }

  const enclosureScore = Math.round(clamp(shellAtoms / 16, 0, 45));
  const contactScore = Math.round(clamp(contacts / 7, 0, 35));
  const collisionScore = Math.round(clamp(20 - collisions * 1.8 - severeCollisions * 5, 0, 20));
  if (contactScore < 8) {
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
    reason: labelForScore(total, collisions, severeCollisions),
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

function renderScore(score) {
  scoreNumber.textContent = String(score.total);
  scoreLabel.textContent = score.reason;
  enclosureScoreEl.textContent = `${score.enclosureScore}/45`;
  collisionScoreEl.textContent = `${score.collisionScore}/20`;
  contactScoreEl.textContent = `${score.contactScore}/35`;
  if (score.total === 0) {
    message.textContent = score.reason === "外れています"
      ? "カテキンが表面から離れすぎています。表面へ吸着してから、くぼみの近くへ動かしてください。"
      : "カテキンがタンパク質の内部に入り込みすぎています。外へ出してから置き直してください。";
    return;
  }
  message.textContent = "表面に近く、めり込みが少なく、周囲にタンパク質がある配置ほど高得点です。";
}

function clearScore() {
  scoreNumber.textContent = "--";
  scoreLabel.textContent = "まだ判定していません";
  enclosureScoreEl.textContent = "--";
  collisionScoreEl.textContent = "--";
  contactScoreEl.textContent = "--";
  message.textContent = "まずタンパク質を回して、よさそうなくぼみを探してください。";
}

function labelForScore(score, collisions, severeCollisions) {
  if (severeCollisions > 0 || collisions > 10) return "少しめり込み";
  if (score >= 82) return "かなりハマっている";
  if (score >= 62) return "入りそう";
  if (score >= 40) return "浅く接触している";
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

function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
