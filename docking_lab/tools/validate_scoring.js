// スコア関数の検証（再ドッキング試験）。
// ランダムな位置から山登り探索を行い、結晶構造のポーズより高得点の「偽の正解」が
// 見つからないか、見つかった最高点のポーズが結晶構造に近いかを調べる。
//   node tools/validate_scoring.js data/avidin-biotin.js [試行回数]
const path = require("path");
const S = require("../scoring.js");
require(path.resolve(process.argv[2]));
const runs = Number(process.argv[3] || 40);
const stage = globalThis.DOCKING_STAGES[0];
const protein = S.parsePdbAtoms(stage.proteinPdb, stage.proteinFlags);
const grid = S.buildGrid(protein);
const tpl = S.makeTemplate(stage.ligand);

let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const randomRotation = () => S.axisAngleMatrix(gauss(), gauss(), gauss(), rand() * Math.PI * 2);

const crystal = S.crystalPose(tpl);
const ref = S.scorePose(grid, S.placeLigand(tpl, crystal), tpl);
console.log("結晶構造のポーズ: raw =", ref.raw.toFixed(2), JSON.stringify(ref.parts, (k, v) => typeof v === "number" ? +v.toFixed(2) : v));
console.log("  水素結合:", ref.hbonds.map((h) => `${tpl.atoms[h.li].name}-${h.p.res}${h.p.resi}:${h.p.name}(${h.d.toFixed(2)})`).join(", "));

function perturb(pose, scale, flexible) {
  const R = S.matMul(S.axisAngleMatrix(gauss(), gauss(), gauss(), gauss() * 0.25 * scale), pose.R);
  const t = { x: pose.t.x + gauss() * 0.6 * scale, y: pose.t.y + gauss() * 0.6 * scale, z: pose.t.z + gauss() * 0.6 * scale };
  const torsions = pose.torsions.map((a) => (flexible && rand() < 0.4 ? a + gauss() * 0.5 * scale : a));
  return { R, t, torsions };
}

function search(flexible, startRadius) {
  let pose = {
    R: randomRotation(),
    t: { x: tpl.center.x + gauss() * startRadius, y: tpl.center.y + gauss() * startRadius, z: tpl.center.z + gauss() * startRadius },
    torsions: tpl.torsions.map(() => (flexible ? (rand() - 0.5) * Math.PI * 2 : 0)),
  };
  let cur = S.scorePose(grid, S.placeLigand(tpl, pose), tpl).raw;
  let best = { pose, score: cur };
  const steps = 6000;
  for (let i = 0; i < steps; i++) {
    const temp = 1.5 * (1 - i / steps) + 0.02;
    const cand = perturb(pose, 0.3 + 1.2 * (1 - i / steps), flexible);
    const sc = S.scorePose(grid, S.placeLigand(tpl, cand), tpl).raw;
    if (sc > cur || rand() < Math.exp((sc - cur) / temp)) {
      pose = cand; cur = sc;
      if (sc > best.score) best = { pose: cand, score: sc };
    }
  }
  return { score: best.score, rmsd: S.rmsdToCrystal(tpl, S.placeLigand(tpl, best.pose)) };
}

for (const [label, flexible, radius] of [["剛体・ポケット付近から", false, 4], ["ねじれあり・ポケット付近から", true, 4], ["剛体・タンパク質全体から", false, 14]]) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(search(flexible, radius));
  results.sort((a, b) => b.score - a.score);
  const better = results.filter((r) => r.score > ref.raw);
  const fakeBetter = better.filter((r) => r.rmsd > 2.5);
  const near = results.filter((r) => r.rmsd <= 2.0);
  console.log(`\n[${label}] ${runs} 回`);
  console.log("  上位 5 件 (点数 = 結晶比, RMSD):", results.slice(0, 5).map((r) => `${(100 * r.score / ref.raw).toFixed(0)}点/${r.rmsd.toFixed(1)}Å`).join("  "));
  console.log(`  結晶より高得点: ${better.length} 件（うち結晶から 2.5 Å 以上離れた偽の正解: ${fakeBetter.length} 件）`);
  console.log(`  RMSD 2 Å 以内に到達: ${near.length} 件`);
  const far = results.filter((r) => r.rmsd > 4).sort((a, b) => b.score - a.score)[0];
  if (far) console.log(`  結晶から 4 Å 以上離れたポーズの最高点: ${(100 * far.score / ref.raw).toFixed(0)}点`);
}
