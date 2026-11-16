// ドッキングラボ: 構造ファイル（PDB / mmCIF / SDF / MOL）をブラウザ内で読み解く。
// tools/prepare_stage.py と同じ考え方で、原子に相互作用の型を付ける。
// ファイルはどこにも送らず、この画面の中だけで処理する。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./scoring.js"));
  else root.DockStructure = factory(root.DockScoring);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  const F = S.FLAG;

  const METALS = new Set(["FE", "ZN", "CU", "MN", "MG", "CA", "CO", "NI", "CD", "HG", "K", "NA"]);

  // 水や、結晶化のときに加えるだけの物質。リガンドの候補から外す
  const SOLVENTS = new Set(["HOH", "DOD", "WAT", "SO4", "PO4", "GOL", "EDO", "PEG", "MPD", "ACT", "DMS",
    "TRS", "EPE", "IMD", "FMT", "CL", "BR", "IOD", "NO3", "NH4", "AZI", "CIT", "TLA", "MES", "BME"]);

  // 糖鎖。タンパク質に付いている飾りで、目的のリガンドであることは少ない
  const SUGARS = new Set(["NAG", "NDG", "BMA", "MAN", "FUC", "FUL", "GAL", "GLC", "BGC", "XYL", "SIA",
    "A2G", "RAM", "GLA", "NGA"]);

  const AMINO = new Set(["ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE", "LEU",
    "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL", "MSE", "SEC", "PYL"]);

  const PROT_DONOR = new Set(["ARG|NE", "ARG|NH1", "ARG|NH2", "ASN|ND2", "GLN|NE2", "HIS|ND1", "HIS|NE2",
    "LYS|NZ", "SER|OG", "THR|OG1", "TYR|OH", "TRP|NE1", "CYS|SG"]);
  const PROT_ACCEPTOR = new Set(["ASP|OD1", "ASP|OD2", "GLU|OE1", "GLU|OE2", "ASN|OD1", "GLN|OE1",
    "HIS|ND1", "HIS|NE2", "SER|OG", "THR|OG1", "TYR|OH"]);
  const PROT_POS = new Set(["LYS|NZ", "ARG|NH1", "ARG|NH2", "ARG|NE"]);
  const PROT_NEG = new Set(["ASP|OD1", "ASP|OD2", "GLU|OE1", "GLU|OE2"]);
  const PROT_COORD = new Set(["TYR|OH", "ASP|OD1", "ASP|OD2", "GLU|OE1", "GLU|OE2", "HIS|NE2", "HIS|ND1",
    "CYS|SG", "MET|SD"]);

  const COVALENT = { FE: 1.25, ZN: 1.2, CU: 1.2, MN: 1.3, MG: 1.3, CA: 1.4, NA: 1.4, K: 1.6,
    C: 0.77, N: 0.75, O: 0.73, S: 1.02, P: 1.06, F: 0.71, CL: 0.99, BR: 1.14, I: 1.33, B: 0.85, SE: 1.17 };

  function elementFromName(name) {
    const trimmed = name.replace(/[0-9'"]/g, "").toUpperCase();
    if (!trimmed) return "C";
    if (trimmed.length >= 2 && COVALENT[trimmed.slice(0, 2)] !== undefined) return trimmed.slice(0, 2);
    return trimmed[0];
  }

  // ---------- 構造ファイルの読み込み ----------

  function detectFormat(name, text) {
    const lower = (name || "").toLowerCase();
    if (lower.endsWith(".cif") || lower.endsWith(".mmcif")) return "cif";
    if (lower.endsWith(".sdf") || lower.endsWith(".mol")) return "sdf";
    if (lower.endsWith(".pdb") || lower.endsWith(".ent")) return "pdb";
    if (/^data_|_atom_site\./m.test(text)) return "cif";
    if (/^(ATOM|HETATM)/m.test(text)) return "pdb";
    if (/V[23]000/.test(text)) return "sdf";
    return null;
  }

  function parsePdb(text) {
    const atoms = [];
    let sawModel = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("MODEL ")) { sawModel = true; continue; }
      if (sawModel && line.startsWith("ENDMDL")) break; // NMR 構造は 1 つ目のモデルだけ使う
      const tag = line.slice(0, 6);
      if (tag !== "ATOM  " && tag !== "HETATM") continue;
      const alt = line.slice(16, 17);
      if (alt !== " " && alt !== "A") continue;
      const x = Number(line.slice(30, 38)), y = Number(line.slice(38, 46)), z = Number(line.slice(46, 54));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const name = line.slice(12, 16).trim();
      let el = line.slice(76, 78).trim().toUpperCase();
      if (!el) el = elementFromName(name);
      if (el === "H" || el === "D") continue;
      atoms.push({
        hetero: tag === "HETATM",
        name, el,
        res: line.slice(17, 20).trim().toUpperCase(),
        chain: line.slice(21, 22).trim() || "A",
        resi: parseInt(line.slice(22, 26), 10) || 0,
        icode: line.slice(26, 27).trim(),
        model: 1,
        x, y, z,
      });
    }
    return atoms;
  }

  function parseCif(text) {
    const lines = text.split("\n");
    const atoms = [];
    let cols = null, start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("_atom_site.")) {
        if (!cols) { cols = []; start = i; }
        cols.push(lines[i].trim().slice("_atom_site.".length));
      } else if (cols && start >= 0 && i > start + cols.length - 1) {
        break;
      }
    }
    if (!cols) return atoms;
    const idx = {};
    cols.forEach((c, i) => (idx[c] = i));
    const need = (row, key, fallback) => {
      const i = idx[key];
      return i === undefined ? fallback : row[i];
    };
    for (const line of lines) {
      if (!/^(ATOM|HETATM)/.test(line)) continue;
      const row = line.trim().split(/\s+/);
      if (row.length < cols.length) continue;
      const alt = need(row, "label_alt_id", ".");
      if (alt !== "." && alt !== "?" && alt !== "A") continue;
      const model = parseInt(need(row, "pdbx_PDB_model_num", "1"), 10) || 1;
      if (model !== 1) continue;
      const el = (need(row, "type_symbol", "C") || "C").toUpperCase();
      if (el === "H" || el === "D") continue;
      const x = Number(need(row, "Cartn_x", NaN)), y = Number(need(row, "Cartn_y", NaN)), z = Number(need(row, "Cartn_z", NaN));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      atoms.push({
        hetero: row[0] === "HETATM",
        name: (need(row, "label_atom_id", "C") || "C").replace(/"/g, ""),
        el,
        res: (need(row, "label_comp_id", "UNK") || "UNK").toUpperCase(),
        chain: need(row, "auth_asym_id", null) || need(row, "label_asym_id", "A"),
        resi: parseInt(need(row, "auth_seq_id", null) || need(row, "label_seq_id", "0"), 10) || 0,
        icode: "",
        model,
        x, y, z,
      });
    }
    return atoms;
  }

  // SDF / MOL（V2000）。複数の分子が入っていれば、すべて返す
  function parseSdf(text) {
    const molecules = [];
    for (const block of text.split(/^\$\$\$\$\s*$/m)) {
      const lines = block.split("\n");
      const headerAt = lines.findIndex((l) => /V2000/.test(l));
      if (headerAt < 0) continue;
      const counts = lines[headerAt];
      const nAtoms = parseInt(counts.slice(0, 3), 10);
      const nBonds = parseInt(counts.slice(3, 6), 10);
      if (!Number.isFinite(nAtoms) || nAtoms < 1) continue;
      const name = (lines[Math.max(0, headerAt - 3)] || "").trim();
      const raw = [], hydrogens = [];
      for (let i = 0; i < nAtoms; i++) {
        const line = lines[headerAt + 1 + i] || "";
        const x = Number(line.slice(0, 10)), y = Number(line.slice(10, 20)), z = Number(line.slice(20, 30));
        const el = line.slice(31, 34).trim().toUpperCase();
        raw.push({ el, x, y, z, hydrogenCount: 0 });
      }
      const rawBonds = [];
      for (let i = 0; i < nBonds; i++) {
        const line = lines[headerAt + 1 + nAtoms + i] || "";
        const a = parseInt(line.slice(0, 3), 10) - 1;
        const b = parseInt(line.slice(3, 6), 10) - 1;
        const order = parseInt(line.slice(6, 9), 10) || 1;
        if (raw[a] && raw[b]) rawBonds.push([a, b, order]);
      }
      // 水素は数だけ覚えて取り除く
      for (const [a, b] of rawBonds) {
        if (raw[a].el === "H") raw[b].hydrogenCount++;
        if (raw[b].el === "H") raw[a].hydrogenCount++;
      }
      const keep = [], map = new Map();
      raw.forEach((atom, i) => {
        if (atom.el === "H" || atom.el === "D") return;
        map.set(i, keep.length);
        keep.push(atom);
      });
      if (!keep.length) continue;
      const bonds = [];
      const orders = new Map();
      for (const [a, b, order] of rawBonds) {
        if (!map.has(a) || !map.has(b)) continue;
        const i = map.get(a), j = map.get(b);
        bonds.push([Math.min(i, j), Math.max(i, j)]);
        orders.set(Math.min(i, j) + "|" + Math.max(i, j), order);
      }
      const atoms = keep.map((atom, i) => ({
        name: atom.el + (i + 1), el: atom.el,
        x: round(atom.x), y: round(atom.y), z: round(atom.z),
        hydrogenCount: atom.hydrogenCount, flags: 0,
      }));
      molecules.push({ name: name || "分子 " + (molecules.length + 1), atoms, bonds, orders, hasHydrogenInfo: raw.some((a) => a.el === "H") });
    }
    return molecules;
  }

  function round(v) {
    return Math.round(v * 1000) / 1000;
  }

  function parseStructure(name, text) {
    const format = detectFormat(name, text);
    if (!format) throw new Error("ファイルの形式が分かりませんでした。PDB、mmCIF、SDF、MOL に対応しています。");
    if (format === "sdf") return { format, molecules: parseSdf(text) };
    const atoms = format === "cif" ? parseCif(text) : parsePdb(text);
    if (!atoms.length) throw new Error("原子が読み取れませんでした。座標を含むファイルか確認してください。");
    return { format, atoms, text };
  }

  // ---------- タンパク質の原子に型を付ける ----------

  function makeCellIndex(atoms, cell) {
    const grid = new Map();
    const key = (i, j, k) => i * 73856093 + j * 19349663 + k * 83492791;
    atoms.forEach((a, index) => {
      const k = key(Math.floor(a.x / cell), Math.floor(a.y / cell), Math.floor(a.z / cell));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(index);
    });
    return {
      near(x, y, z) {
        const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
        const out = [];
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
          const list = grid.get(key(ci + di, cj + dj, ck + dk));
          if (list) out.push(...list);
        }
        return out;
      },
    };
  }

  // 受容体（タンパク質）側の原子。hetero を含めるかは呼び出し側で決める
  function typeProtein(atoms) {
    const index = makeCellIndex(atoms, 2.0);
    atoms.forEach((a, i) => {
      a.index = i;
      let f = 0;
      const key = a.res + "|" + a.name;
      if (AMINO.has(a.res)) {
        if (a.name === "N" && a.res !== "PRO") f |= F.DONOR;
        if (a.name === "O" || a.name === "OXT") f |= F.ACCEPTOR;
        if (PROT_DONOR.has(key)) f |= F.DONOR;
        if (PROT_ACCEPTOR.has(key)) f |= F.ACCEPTOR;
        if (PROT_POS.has(key)) f |= F.POSITIVE;
        if (PROT_NEG.has(key)) f |= F.NEGATIVE;
        if (PROT_COORD.has(key)) f |= F.COORD;
      } else {
        // 糖鎖や補因子など、アミノ酸でない部分は元素から決める
        if (a.el === "O") { f |= F.ACCEPTOR | F.DONOR | F.COORD; }
        else if (a.el === "N") { f |= F.DONOR | F.ACCEPTOR | F.COORD; }
      }
      if (a.el === "C") {
        let polar = false;
        for (const j of index.near(a.x, a.y, a.z)) {
          if (j === i) continue;
          const b = atoms[j];
          if (b.el !== "N" && b.el !== "O") continue;
          if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1.75) { polar = true; break; }
        }
        if (!polar) f |= F.HYDROPHOBIC;
      }
      if (a.el === "S" || a.el === "SE") f |= F.HYDROPHOBIC;
      a.flags = f;
    });
    return atoms;
  }

  // ---------- リガンドの組み立て ----------

  function inferBonds(atoms) {
    const bonds = [];
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const limit = (COVALENT[atoms[i].el] || 0.8) + (COVALENT[atoms[j].el] || 0.8) + 0.45;
        const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);
        if (d < limit) bonds.push([i, j]);
      }
    }
    return bonds;
  }

  function neighborList(count, bonds) {
    const nb = Array.from({ length: count }, () => []);
    for (const [i, j] of bonds) { nb[i].push(j); nb[j].push(i); }
    return nb;
  }

  // i から、b を通らずに届く原子
  function reachable(nb, from, blocked) {
    const seen = new Set([from]);
    const stack = nb[from].filter((k) => k !== blocked);
    while (stack.length) {
      const k = stack.pop();
      if (seen.has(k)) continue;
      seen.add(k);
      for (const m of nb[k]) stack.push(m);
    }
    seen.delete(from);
    return seen;
  }

  function ringBonds(nb, bonds) {
    const inRing = new Set();
    for (const [i, j] of bonds) {
      // i-j を切っても i から j に届くなら、その結合は環の一部
      if (reachable(nb, i, j).has(j)) inRing.add(i + "|" + j);
    }
    return inRing;
  }

  function findTorsions(atoms, bonds, nb, orders) {
    const rings = ringBonds(nb, bonds);
    const out = [];
    for (const [i, j] of bonds) {
      if (rings.has(i + "|" + j)) continue;
      if (nb[i].length < 2 || nb[j].length < 2) continue;
      if (orders) {
        const order = orders.get(i + "|" + j);
        if (order && order !== 1) continue; // 二重結合や芳香環の結合は回らない
      }
      const sideJ = Array.from(reachable(nb, j, i)).sort((a, b) => a - b);
      const sideI = Array.from(reachable(nb, i, j)).sort((a, b) => a - b);
      if (sideJ.length <= sideI.length) out.push({ a: i, b: j, moving: sideJ });
      else out.push({ a: j, b: i, moving: sideI });
    }
    return out;
  }

  // 3 本の結合が平面に並んでいないか（角錐形か）を調べる
  function isPyramidal(atoms, neighbors, center) {
    const vectors = neighbors.map((k) => {
      const v = { x: atoms[k].x - center.x, y: atoms[k].y - center.y, z: atoms[k].z - center.z };
      const len = Math.hypot(v.x, v.y, v.z) || 1;
      return { x: v.x / len, y: v.y / len, z: v.z / len };
    });
    // 3 つの単位ベクトルの和の長さ。平面なら 0 に近く、角錐なら 0.3 より大きい
    const sum = vectors.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }), { x: 0, y: 0, z: 0 });
    return Math.hypot(sum.x, sum.y, sum.z) > 0.35;
  }

  // 座標と結合から、リガンド原子の相互作用の型を決める
  function typeLigand(atoms, bonds, options) {
    const useHydrogen = options && options.useHydrogen;
    const nb = neighborList(atoms.length, bonds);
    atoms.forEach((a, i) => {
      let f = 0;
      const el = a.el;
      const metalNeighbor = nb[i].some((k) => METALS.has(atoms[k].el));
      if (el === "O") {
        f |= F.ACCEPTOR;
        if (metalNeighbor) {
          f |= F.NEGATIVE;
        } else if (useHydrogen) {
          if (a.hydrogenCount > 0) f |= F.DONOR;
          else if (nb[i].length === 1) {
            const c = nb[i][0];
            const siblings = nb[c].filter((k) => atoms[k].el === "O" && nb[k].length === 1);
            if (siblings.length >= 2) f |= F.NEGATIVE; // カルボン酸・リン酸
          }
        } else if (nb[i].length === 1) {
          const c = nb[i][0];
          // カルボン酸・リン酸・炭酸: 同じ原子に付いた酸素が 2 つ以上で、どれも先端か金属に配位している
          const siblings = nb[c].filter((k) => atoms[k].el === "O");
          const spread = siblings.length >= 2 &&
            siblings.every((k) => nb[k].length === 1 || nb[k].some((m) => METALS.has(atoms[m].el)));
          const d = Math.hypot(a.x - atoms[c].x, a.y - atoms[c].y, a.z - atoms[c].z);
          if (spread && ["C", "P", "S"].includes(atoms[c].el)) f |= F.NEGATIVE;
          else if (atoms[c].el === "C" && d > 1.33) f |= F.DONOR; // ヒドロキシ基
        }
      } else if (el === "N") {
        if (useHydrogen) {
          if (a.hydrogenCount > 0) f |= F.DONOR;
          if (a.hydrogenCount === 0 && nb[i].length <= 2) f |= F.ACCEPTOR;
        } else if (nb[i].length <= 2) {
          f |= F.DONOR;
        }
        // 結合が 3 本で角錐形の窒素はアミン。体の中ではプロトンが付いて陽イオンになる
        if (nb[i].length === 3 && isPyramidal(atoms, nb[i], a)) f |= F.DONOR | F.POSITIVE;
      } else if (el === "C") {
        if (!nb[i].some((k) => atoms[k].el === "N" || atoms[k].el === "O")) f |= F.HYDROPHOBIC;
      } else if (METALS.has(el)) {
        f |= F.METAL;
      } else if (["S", "SE", "CL", "BR", "I", "F"].includes(el)) {
        f |= F.HYDROPHOBIC;
      }
      a.flags = f;
    });
    return nb;
  }

  // PDB / mmCIF の中の 1 残基（またはつながった数残基）をリガンドにする
  function buildLigandFromAtoms(source) {
    const atoms = source.map((a, i) => ({ name: a.name || a.el + (i + 1), el: a.el, x: a.x, y: a.y, z: a.z, flags: 0 }));
    const bonds = inferBonds(atoms);
    const nb = typeLigand(atoms, bonds, { useHydrogen: false });
    return { atoms, bonds, torsions: findTorsions(atoms, bonds, nb, null) };
  }

  function buildLigandFromMolecule(mol) {
    const atoms = mol.atoms.map((a) => ({ name: a.name, el: a.el, x: a.x, y: a.y, z: a.z, hydrogenCount: a.hydrogenCount, flags: 0 }));
    const bonds = mol.bonds.length ? mol.bonds : inferBonds(atoms);
    const nb = typeLigand(atoms, bonds, { useHydrogen: mol.hasHydrogenInfo });
    return { atoms, bonds, torsions: findTorsions(atoms, bonds, nb, mol.orders) };
  }

  // 構造の中から、リガンドになりそうな残基のまとまりを探す
  function findLigandGroups(atoms) {
    const groups = new Map();
    for (const a of atoms) {
      if (!a.hetero) continue;
      if (a.res === "HOH" || a.res === "DOD" || a.res === "WAT") continue;
      const key = a.chain + "|" + a.resi + "|" + a.icode + "|" + a.res;
      if (!groups.has(key)) groups.set(key, { res: a.res, chain: a.chain, resi: a.resi, icode: a.icode, atoms: [] });
      groups.get(key).atoms.push(a);
    }
    const list = Array.from(groups.values()).map((g) => ({
      ...g,
      id: g.chain + ":" + g.resi + (g.icode || "") + ":" + g.res,
      label: `${g.res}（鎖 ${g.chain}・残基 ${g.resi}${g.icode || ""}）`,
      count: g.atoms.length,
      solvent: SOLVENTS.has(g.res),
      sugar: SUGARS.has(g.res),
      metal: g.atoms.length === 1 && METALS.has(g.atoms[0].el),
    }));
    // 目的のリガンドになりやすい順。糖鎖や緩衝剤は後ろに回し、金属イオンは見つけやすいように前に出す
    const rank = (g) => (g.solvent ? 2 : g.sugar ? 1 : 0);
    const weight = (g) => (g.metal ? g.count + 9 : g.count);
    list.sort((a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : weight(b) - weight(a)));
    return list;
  }

  // 選んだリガンドの近くにある、別の小さな分子（金属イオンなど）を見つける
  function nearbyGroups(groups, target, cutoff) {
    const out = [];
    for (const g of groups) {
      if (g === target) continue;
      let close = false;
      for (const a of g.atoms) {
        for (const b of target.atoms) {
          if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < cutoff) { close = true; break; }
        }
        if (close) break;
      }
      if (close) out.push(g);
    }
    return out;
  }

  return {
    SUGARS,
    parseStructure, parsePdb, parseCif, parseSdf, detectFormat,
    typeProtein, typeLigand, inferBonds, findTorsions, neighborList,
    buildLigandFromAtoms, buildLigandFromMolecule, findLigandGroups, nearbyGroups,
    METALS, SOLVENTS, AMINO,
  };
});
