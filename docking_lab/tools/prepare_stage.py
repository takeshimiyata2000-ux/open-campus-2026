#!/usr/bin/env python3
"""ステージデータ生成スクリプト。
mmCIF から受容体（タンパク質）と結晶構造中のリガンドを取り出し、
相互作用の型（水素結合ドナー/アクセプター・疎水性・電荷）を付けて
docking_lab/data/<stage>.js を出力する。

使い方:
  python3 tools/prepare_stage.py <cif> <リガンド名> <リガンドのauth鎖> <stage id> [--chains A,B]
  リガンド名は "FE+CO3" のように + でつなぐと、複数の残基を 1 つの分子として扱う。
"""
import sys, json, math, argparse
import numpy as np

DONOR = 1; ACCEPTOR = 2; HYDROPHOBIC = 4; POSITIVE = 8; NEGATIVE = 16; METAL = 32; COORD = 64

METALS = {"FE", "ZN", "CU", "MN", "MG", "CA", "CO", "NI"}
PROT_COORD = {("TYR","OH"),("ASP","OD1"),("ASP","OD2"),("GLU","OE1"),("GLU","OE2"),("HIS","NE2"),("HIS","ND1")}

PROT_DONOR = {("ARG","NE"),("ARG","NH1"),("ARG","NH2"),("ASN","ND2"),("GLN","NE2"),
              ("HIS","ND1"),("HIS","NE2"),("LYS","NZ"),("SER","OG"),("THR","OG1"),
              ("TYR","OH"),("TRP","NE1")}
PROT_ACCEPTOR = {("ASP","OD1"),("ASP","OD2"),("GLU","OE1"),("GLU","OE2"),("ASN","OD1"),
                 ("GLN","OE1"),("HIS","ND1"),("HIS","NE2"),("SER","OG"),("THR","OG1"),("TYR","OH")}
PROT_POS = {("LYS","NZ"),("ARG","NH1"),("ARG","NH2"),("ARG","NE")}
PROT_NEG = {("ASP","OD1"),("ASP","OD2"),("GLU","OE1"),("GLU","OE2")}

def parse_cif(path):
    cols, rows, in_loop = [], [], False
    for line in open(path):
        if line.startswith("_atom_site."):
            cols.append(line.strip().split(".")[1]); in_loop = True; continue
        if in_loop and (line.startswith("ATOM") or line.startswith("HETATM")):
            p = line.split()
            rows.append(dict(zip(cols, p)))
        elif in_loop and rows and line.startswith("#"):
            break
    return rows

def typed_protein(atoms):
    xyz = np.array([[a["x"],a["y"],a["z"]] for a in atoms])
    hetero = np.array([a["el"] in ("N","O") for a in atoms])
    for i,a in enumerate(atoms):
        f = 0; key = (a["res"], a["name"])
        if a["name"] == "N" and a["res"] != "PRO": f |= DONOR
        if a["name"] in ("O","OXT"): f |= ACCEPTOR
        if key in PROT_DONOR: f |= DONOR
        if key in PROT_ACCEPTOR: f |= ACCEPTOR
        if key in PROT_POS: f |= POSITIVE
        if key in PROT_NEG: f |= NEGATIVE
        if key in PROT_COORD: f |= COORD
        if a["el"] == "C":
            d = np.linalg.norm(xyz - xyz[i], axis=1)
            if not np.any(hetero & (d < 1.75)): f |= HYDROPHOBIC
        if a["el"] == "S": f |= HYDROPHOBIC
        a["flags"] = f
    return atoms

def ligand_bonds(lig):
    cov = {"FE":1.25,"ZN":1.2,"CU":1.2,"MN":1.3,"C":0.77,"N":0.75,"O":0.73,"S":1.02,"P":1.06,"F":0.71,"CL":0.99,"BR":1.14,"I":1.33}
    bonds = []
    for i in range(len(lig)):
        for j in range(i+1, len(lig)):
            d = math.dist(lig[i]["xyz"], lig[j]["xyz"])
            if d < cov.get(lig[i]["el"],0.8) + cov.get(lig[j]["el"],0.8) + 0.45:
                bonds.append((i,j))
    return bonds

def typed_ligand(lig, bonds, overrides):
    nb = {i:[] for i in range(len(lig))}
    for i,j in bonds: nb[i].append(j); nb[j].append(i)
    for i,a in enumerate(lig):
        f = 0; el = a["el"]
        if el == "O":
            f |= ACCEPTOR
            if any(lig[k]["el"] in METALS for k in nb[i]):
                f |= NEGATIVE                                                                # 金属に結合した酸素（炭酸イオンなど）
            elif len(nb[i]) == 1:
                c = nb[i][0]
                o_sibs = [k for k in nb[c] if lig[k]["el"] == "O"]
                d = math.dist(a["xyz"], lig[c]["xyz"])
                if lig[c]["el"] in ("C","P","S") and len(o_sibs) >= 2 and all(len(nb[k]) == 1 or any(lig[m]["el"] in METALS for m in nb[k]) for k in o_sibs):
                    f |= NEGATIVE                                                            # カルボン酸・リン酸・炭酸
                elif lig[c]["el"] == "C" and d > 1.33: f |= DONOR                            # ヒドロキシ基
        elif el == "N":
            if len(nb[i]) <= 2: f |= DONOR
            if len(nb[i]) == 1: f |= POSITIVE if False else 0
        elif el == "C":
            if not any(lig[k]["el"] in ("N","O") for k in nb[i]): f |= HYDROPHOBIC
        elif el in ("S","CL","BR","I","F"):
            f |= HYDROPHOBIC
        elif el in METALS:
            f |= METAL
        if a["name"] in overrides: f = overrides[a["name"]]
        a["flags"] = f
    return nb

def find_rings(nb, n):
    in_ring = set()
    for i in range(n):
        for j in nb[i]:
            if j < i: continue
            # i-j を切っても i から j に届くなら環の結合
            seen = {i}; stack = [k for k in nb[i] if k != j]
            while stack:
                k = stack.pop()
                if k in seen: continue
                seen.add(k); stack.extend(nb[k])
            if j in seen: in_ring.add((i,j))
    return in_ring

def torsions(lig, bonds, nb):
    ring = find_rings(nb, len(lig))
    out = []
    for i,j in bonds:
        if (i,j) in ring: continue
        if len(nb[i]) < 2 or len(nb[j]) < 2: continue
        # j 側（i を通らずに届く原子）を動かす。小さい側を動かす
        def side(a, b):
            seen = {a}; stack = [k for k in nb[a] if k != b]
            while stack:
                k = stack.pop()
                if k in seen: continue
                seen.add(k); stack.extend(nb[k])
            return sorted(seen - {a})
        sj, si = side(j, i), side(i, j)
        if len(sj) <= len(si): out.append({"a": i, "b": j, "moving": sj})
        else: out.append({"a": j, "b": i, "moving": si})
    return out

def pdb_line(serial, a):
    name = a["name"]; nm = name if len(name) == 4 else " " + name.ljust(3)
    return "ATOM  %5d %4s %3s %1s%4d    %8.3f%8.3f%8.3f%6.2f%6.2f          %2s" % (
        serial, nm, a["res"], a["chain"], a["resi"], a["x"], a["y"], a["z"], 1.0, 20.0, a["el"].rjust(2))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cif"); ap.add_argument("ligand"); ap.add_argument("ligchain"); ap.add_argument("stage")
    ap.add_argument("--chains", default="")
    ap.add_argument("--meta", default="{}")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    rows = parse_cif(args.cif)
    keep = set(args.chains.split(",")) if args.chains else None
    prot, lig = [], []
    for r in rows:
        if r.get("pdbx_PDB_model_num", "1") != "1": continue
        if r["label_alt_id"] not in (".", "A"): continue
        el = r["type_symbol"].upper()
        if el in ("H", "D"): continue
        x, y, z = float(r["Cartn_x"]), float(r["Cartn_y"]), float(r["Cartn_z"])
        if r["group_PDB"] == "ATOM":
            if keep and r["auth_asym_id"] not in keep: continue
            prot.append({"name": r["label_atom_id"].strip('"'), "res": r["label_comp_id"], "chain": r["auth_asym_id"],
                         "resi": int(r["auth_seq_id"]), "el": el, "x": x, "y": y, "z": z})
        elif r["label_comp_id"] in args.ligand.split("+") and r["auth_asym_id"] == args.ligchain:
            lig.append({"name": r["label_atom_id"].strip('"'), "el": el, "xyz": [x, y, z]})
    assert prot and lig, "protein or ligand not found"
    typed_protein(prot)
    meta = json.loads(args.meta)
    bonds = ligand_bonds(lig)
    nb = typed_ligand(lig, bonds, meta.pop("ligandFlagOverrides", {}))
    tors = torsions(lig, bonds, nb)
    data = {
        "id": args.stage,
        **meta,
        "proteinPdb": "\n".join(pdb_line(i + 1, a) for i, a in enumerate(prot)) + "\nEND\n",
        "proteinFlags": [a["flags"] for a in prot],
        "ligand": {
            "atoms": [{"name": a["name"], "el": a["el"], "x": round(a["xyz"][0], 3), "y": round(a["xyz"][1], 3),
                       "z": round(a["xyz"][2], 3), "flags": a["flags"]} for a in lig],
            "bonds": [[i, j] for i, j in bonds],
            "torsions": tors,
        },
    }
    out = args.out or f"data/{args.stage}.js"
    with open(out, "w") as f:
        f.write("// tools/prepare_stage.py で自動生成。手で編集しない。\n")
        f.write("(function(g){(g.DOCKING_STAGES=g.DOCKING_STAGES||[]).push(")
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        f.write(");})(typeof window!=='undefined'?window:globalThis);\n")
    print("protein atoms", len(prot), "ligand atoms", len(lig), "bonds", len(bonds), "torsions", len(tors))
    for a in lig: print(" ", a["name"], a["el"], a["flags"])
    for t in tors: print("  torsion", lig[t["a"]]["name"], "-", lig[t["b"]]["name"], "moves", [lig[k]["name"] for k in t["moving"]])

main()
