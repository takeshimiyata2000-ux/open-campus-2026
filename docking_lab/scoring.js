// ドッキングラボ: スコア関数と分子の幾何計算。
// ブラウザ（window.DockScoring）と Node（検証スクリプト）の両方から使う。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DockScoring = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // METAL: リガンド側の金属イオン。COORD: 金属に配位できるタンパク質側の原子（Tyr・Asp・Glu の O、His の N）
  const FLAG = { DONOR: 1, ACCEPTOR: 2, HYDROPHOBIC: 4, POSITIVE: 8, NEGATIVE: 16, METAL: 32, COORD: 64 };

  // 各項目の重み。結晶構造のポーズ = 100 点になるよう、後で正規化する。
  const WEIGHTS = { hbond: 1.0, hydrophobic: 0.06, fit: 0.22, electrostatic: 0.5, metal: 1.6, clash: 1.5, intraClash: 1.5 };

  const CELL = 8.0; // 空間グリッドの 1 辺（Å）。埋もれ具合を数える距離（8 Å）以上にする

  // 埋もれ具合: リガンド原子の 8 Å 以内にあるタンパク質原子の数。
  // 水にさらされた表面では水分子との競合で結合が弱まるので、
  // 水素結合と静電相互作用は「奥まった場所ほど強い」ように重み付けする。
  const BURIAL_LOW = 30, BURIAL_HIGH = 75, BURIAL_MIN_FACTOR = 0.15;

  function burialFactor(count) {
    const f = (count - BURIAL_LOW) / (BURIAL_HIGH - BURIAL_LOW);
    return Math.max(0, Math.min(1, f));
  }

  function parsePdbAtoms(pdbText, flags) {
    const atoms = [];
    for (const line of pdbText.split("\n")) {
      if (!line.startsWith("ATOM")) continue;
      atoms.push({
        name: line.slice(12, 16).trim(),
        res: line.slice(17, 20).trim(),
        chain: line.slice(21, 22),
        resi: Number(line.slice(22, 26)),
        x: Number(line.slice(30, 38)),
        y: Number(line.slice(38, 46)),
        z: Number(line.slice(46, 54)),
        el: line.slice(76, 78).trim(),
      });
    }
    atoms.forEach((a, i) => { a.flags = flags[i] || 0; a.index = i; });
    return atoms;
  }

  function buildGrid(atoms) {
    const grid = new Map();
    for (const a of atoms) {
      const key = cellKey(Math.floor(a.x / CELL), Math.floor(a.y / CELL), Math.floor(a.z / CELL));
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(a);
    }
    return grid;
  }

  function cellKey(i, j, k) {
    return i * 73856093 + j * 19349663 + k * 83492791;
  }

  function ramp(d, full, zero) {
    // d <= full で 1、d >= zero で 0、その間は直線
    if (d <= full) return 1;
    if (d >= zero) return 0;
    return (zero - d) / (zero - full);
  }

  function isPolar(atom) {
    return atom.el === "N" || atom.el === "O";
  }

  // ligandAtoms: [{x,y,z,el,flags}]（ワールド座標）
  // 戻り値: 各項目の素点と、表示用の相互作用リスト
  function scorePose(grid, ligandAtoms, template) {
    let hb = 0, hyd = 0, elec = 0, clash = 0, fit = 0, metal = 0;
    const metalBonds = [];
    const hbonds = [];
    const clashes = [];
    const hydResidues = new Map();
    const perAtomHb = new Array(ligandAtoms.length).fill(0);

    for (let li = 0; li < ligandAtoms.length; li++) {
      const l = ligandAtoms[li];
      const ci = Math.floor(l.x / CELL), cj = Math.floor(l.y / CELL), ck = Math.floor(l.z / CELL);

      // まず埋もれ具合を数える
      let near = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const cell = grid.get(cellKey(ci + di, cj + dj, ck + dk));
        if (!cell) continue;
        for (const p of cell) {
          const dx = l.x - p.x, dy = l.y - p.y, dz = l.z - p.z;
          if (dx * dx + dy * dy + dz * dz < 64) near++;
        }
      }
      const buried = burialFactor(near);
      const polarScale = BURIAL_MIN_FACTOR + (1 - BURIAL_MIN_FACTOR) * buried;
      fit += buried;

      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const cell = grid.get(cellKey(ci + di, cj + dj, ck + dk));
        if (!cell) continue;
        for (const p of cell) {
          const dx = l.x - p.x, dy = l.y - p.y, dz = l.z - p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 30.25) continue; // 5.5 Å より遠い
          const d = Math.sqrt(d2);

          const hbPair =
            ((l.flags & FLAG.DONOR) && (p.flags & FLAG.ACCEPTOR)) ||
            ((l.flags & FLAG.ACCEPTOR) && (p.flags & FLAG.DONOR));

          const metalPair = (l.flags & FLAG.METAL) && (p.flags & FLAG.COORD);

          // 金属への配位結合（約 2 Å）。1 つの金属イオンにつき 4 本まで数える
          if (metalPair && d >= 1.7) {
            const s = ramp(d, 2.45, 2.95);
            if (s > 0) {
              const room = Math.max(0, 4 - perAtomHb[li]);
              const used = Math.min(s, room);
              if (used > 0) {
                perAtomHb[li] += used;
                metal += used * polarScale;
                metalBonds.push({ li, p, d, strength: s * polarScale });
              }
            }
          }

          // 衝突（近すぎ）。水素結合できる組は 2.4 Å まで近づける
          const minDist = metalPair ? 1.75 : (l.flags & FLAG.METAL) ? 2.7 : hbPair ? 2.4 : (isPolar(l) && isPolar(p)) ? 2.8 : (isPolar(l) || isPolar(p)) ? 3.0 : 3.2;
          if (d < minDist) {
            const overlap = minDist - d;
            clash += overlap;
            if (overlap > 0.35) clashes.push({ li, p, d });
          }

          if (hbPair && d >= 2.3) {
            const s = ramp(d, 3.1, 3.6);
            if (s > 0) {
              // 1 原子が結べる水素結合の数には限りがある
              const room = Math.max(0, 2.5 - perAtomHb[li]);
              const used = Math.min(s, room);
              if (used > 0) {
                perAtomHb[li] += used;
                hb += used * polarScale;
                hbonds.push({ li, p, d, strength: s * polarScale });
              }
            }
          }

          if ((l.flags & FLAG.HYDROPHOBIC) && (p.flags & FLAG.HYDROPHOBIC) && d >= 3.3) {
            const s = ramp(d, 4.3, 5.0);
            if (s > 0) {
              hyd += s;
              const key = p.chain + ":" + p.res + p.resi;
              hydResidues.set(key, (hydResidues.get(key) || 0) + s);
            }
          }

          const lq = (l.flags & FLAG.POSITIVE) ? 1 : (l.flags & FLAG.NEGATIVE) ? -1 : 0;
          const pq = (p.flags & FLAG.POSITIVE) ? 1 : (p.flags & FLAG.NEGATIVE) ? -1 : 0;
          if (lq && pq) elec += -lq * pq * ramp(d, 3.2, 5.5) * polarScale;
        }
      }
    }

    // 分子内の衝突（ねじりすぎて自分自身にぶつかる）
    let intra = 0;
    if (template && template.nonbonded) {
      for (const [i, j] of template.nonbonded) {
        const a = ligandAtoms[i], b = ligandAtoms[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < 3.0) intra += 3.0 - d;
      }
    }

    // 静電相互作用は 1 つの塩橋ぶん程度で頭打ちにする
    elec = Math.max(-2, Math.min(2, elec));

    const parts = {
      hbond: WEIGHTS.hbond * hb,
      hydrophobic: WEIGHTS.hydrophobic * hyd,
      fit: WEIGHTS.fit * fit,
      electrostatic: WEIGHTS.electrostatic * elec,
      metal: WEIGHTS.metal * metal,
      clash: -WEIGHTS.clash * clash - WEIGHTS.intraClash * intra,
    };
    const raw = parts.hbond + parts.hydrophobic + parts.fit + parts.electrostatic + parts.metal + parts.clash;
    return { raw, parts, hbonds, metalBonds, clashes, hydResidues, intraClash: intra, counts: { hbond: hb, hydrophobic: hyd, clash, fit } };
  }

  // ---- 幾何 ----

  function centroid(atoms) {
    let x = 0, y = 0, z = 0;
    for (const a of atoms) { x += a.x; y += a.y; z += a.z; }
    const n = atoms.length || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  function axisAngleMatrix(ax, ay, az, angle) {
    const len = Math.hypot(ax, ay, az) || 1;
    ax /= len; ay /= len; az /= len;
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [
      t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
      t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
      t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
    ];
  }

  function matMul(a, b) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
    return r;
  }

  function matVec(m, v) {
    return {
      x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
      y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
      z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
    };
  }

  // template: 結晶構造の座標を重心原点に移したリガンド。
  // torsionAngles: 各ねじれ結合の「結晶構造からの回転量」（ラジアン）
  function conformer(template, torsionAngles) {
    const pts = template.atoms.map((a) => ({ x: a.x, y: a.y, z: a.z }));
    template.torsions.forEach((t, idx) => {
      const angle = torsionAngles ? torsionAngles[idx] || 0 : 0;
      if (!angle) return;
      const a = pts[t.a], b = pts[t.b];
      const m = axisAngleMatrix(b.x - a.x, b.y - a.y, b.z - a.z, angle);
      for (const k of t.moving) {
        const v = matVec(m, { x: pts[k].x - b.x, y: pts[k].y - b.y, z: pts[k].z - b.z });
        pts[k] = { x: v.x + b.x, y: v.y + b.y, z: v.z + b.z };
      }
    });
    return pts;
  }

  // pose: { R: 3x3 行列, t: {x,y,z}, torsions: [..] }
  function placeLigand(template, pose) {
    const pts = conformer(template, pose.torsions);
    return template.atoms.map((atom, i) => {
      const v = matVec(pose.R, pts[i]);
      return { name: atom.name, el: atom.el, flags: atom.flags, x: v.x + pose.t.x, y: v.y + pose.t.y, z: v.z + pose.t.z };
    });
  }

  function makeTemplate(ligand) {
    const c = centroid(ligand.atoms);
    return {
      center: c,
      atoms: ligand.atoms.map((a) => ({ ...a, x: a.x - c.x, y: a.y - c.y, z: a.z - c.z })),
      bonds: ligand.bonds,
      torsions: ligand.torsions,
      crystal: ligand.atoms.map((a) => ({ ...a })),
      symmetry: symmetricGroups(ligand),
      nonbonded: nonbondedPairs(ligand),
    };
  }

  // 結合 3 本以上離れた原子の組（分子内衝突の判定に使う）
  function nonbondedPairs(ligand) {
    const n = ligand.atoms.length;
    const nb = ligand.atoms.map(() => []);
    for (const [i, j] of ligand.bonds) { nb[i].push(j); nb[j].push(i); }
    const pairs = [];
    for (let i = 0; i < n; i++) {
      const dist = new Array(n).fill(Infinity);
      dist[i] = 0;
      const queue = [i];
      while (queue.length) {
        const k = queue.shift();
        for (const m of nb[k]) if (dist[m] === Infinity) { dist[m] = dist[k] + 1; queue.push(m); }
      }
      for (let j = i + 1; j < n; j++) if (dist[j] > 3) pairs.push([i, j]);
    }
    // 結晶構造の形ですでに近い組は除く（環の向かい側など）
    return pairs.filter(([i, j]) => {
      const a = ligand.atoms[i], b = ligand.atoms[j];
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >= 3.0;
    });
  }

  // カルボン酸や炭酸イオンの酸素のように、入れ替えても同じ分子になる原子の組。
  // 金属に結合している酸素も、入れ替え可能として扱う。
  function symmetricGroups(ligand) {
    const nb = ligand.atoms.map(() => []);
    for (const [i, j] of ligand.bonds) { nb[i].push(j); nb[j].push(i); }
    const isMetal = (k) => (ligand.atoms[k].flags & FLAG.METAL) !== 0;
    const groups = [];
    ligand.atoms.forEach((atom, c) => {
      if (isMetal(c)) return;
      const oxygens = nb[c].filter((k) => ligand.atoms[k].el === "O" && nb[k].every((m) => m === c || isMetal(m)));
      if (oxygens.length >= 2 && oxygens.length <= 4) groups.push(oxygens);
    });
    return groups;
  }

  function permutations(items) {
    if (items.length <= 1) return [items];
    const out = [];
    items.forEach((item, i) => {
      for (const rest of permutations(items.filter((_, k) => k !== i))) out.push([item, ...rest]);
    });
    return out;
  }

  function rmsdToCrystal(template, placed) {
    const ref = template.crystal;
    const d2 = (p, r) => (p.x - r.x) ** 2 + (p.y - r.y) ** 2 + (p.z - r.z) ** 2;
    let total = placed.reduce((sum, p, i) => sum + d2(p, ref[i]), 0);
    for (const group of template.symmetry) {
      const straight = group.reduce((sum, k) => sum + d2(placed[k], ref[k]), 0);
      let best = straight;
      for (const perm of permutations(group)) {
        const v = group.reduce((sum, k, n) => sum + d2(placed[k], ref[perm[n]]), 0);
        if (v < best) best = v;
      }
      total += best - straight;
    }
    return Math.sqrt(total / placed.length);
  }

  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  function crystalPose(template) {
    return { R: IDENTITY.slice(), t: { ...template.center }, torsions: template.torsions.map(() => 0) };
  }

  return {
    FLAG, WEIGHTS, parsePdbAtoms, buildGrid, scorePose, centroid, axisAngleMatrix, matMul, matVec,
    conformer, placeLigand, makeTemplate, rmsdToCrystal, crystalPose, IDENTITY,
  };
});
