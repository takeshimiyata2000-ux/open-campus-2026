// スクリーニングの検証。各候補をゲームと同じ予算で自動ドッキングし、
// 本物（結晶構造のリガンド）がいちばん高得点になるかを調べる。
//   node tools/validate_screen.js data/screen-avidin.js data/avidin-biotin.js [回数] [試行数] [ステップ数]
const path = require("path");
const S = require("../scoring.js");
require(path.resolve(process.argv[2]));
require(path.resolve(process.argv[3]));
const runs = Number(process.argv[4] || 10), TRIALS = Number(process.argv[5] || 12), STEPS = Number(process.argv[6] || 2400);
const screen = globalThis.DOCKING_SCREENS[0];
const stage = globalThis.DOCKING_STAGES.find((s) => s.id === screen.stageId);
const grid = S.buildGrid(S.parsePdbAtoms(stage.proteinPdb, stage.proteinFlags));
const crystal = S.makeTemplate(stage.ligand);
S.calibrateClash(grid, crystal);
const ref = S.scorePose(grid, S.placeLigand(crystal, S.crystalPose(crystal)), crystal).raw;
const center = crystal.center;
const g = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
console.log(`予算: ${TRIALS} 試行 × ${STEPS} ステップ、各 ${runs} 回`);
for (const c of screen.candidates) {
  const tpl = S.makeTemplate(c.ligand);
  const raw = (p) => S.scorePose(grid, S.placeLigand(tpl, p), tpl).raw;
  const results = [];
  for (let m = 0; m < runs; m++) {
    let best = -1e9;
    for (let t = 0; t < TRIALS; t++) {
      let p = { R: S.axisAngleMatrix(g(), g(), g(), Math.random() * 6.28), t: { x: center.x + g() * 4, y: center.y + g() * 4, z: center.z + g() * 4 }, torsions: tpl.torsions.map(() => (Math.random() - 0.5) * 6.28) };
      let cur = raw(p);
      for (let i = 0; i < STEPS; i++) {
        const pr = i / STEPS, sc = 0.3 + 1.2 * (1 - pr);
        const q = { R: S.matMul(S.axisAngleMatrix(g(), g(), g(), g() * 0.25 * sc), p.R), t: { x: p.t.x + g() * 0.6 * sc, y: p.t.y + g() * 0.6 * sc, z: p.t.z + g() * 0.6 * sc }, torsions: p.torsions.map((a) => (Math.random() < 0.4 ? a + g() * 0.5 * sc : a)) };
        const s = raw(q);
        if (s > cur || Math.random() < Math.exp((s - cur) / (1.5 * (1 - pr) + 0.02))) { p = q; cur = s; if (s > best) best = s; }
      }
    }
    results.push(Math.round((100 * best) / ref));
  }
  results.sort((a, b) => a - b);
  console.log(`${c.name.padEnd(12, "　")} 最低 ${results[0]} / 中央 ${results[Math.floor(runs / 2)]} / 最高 ${results[runs - 1]}`);
}
