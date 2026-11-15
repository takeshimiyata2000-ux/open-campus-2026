#!/usr/bin/env python3
"""スクリーニング用の候補化合物データを作る。
SMILES から RDKit で立体構造を作り、相互作用の型とねじれ結合を付けて
docking_lab/data/<id>.js に書き出す。結晶構造のない化合物も候補にできる。

使い方:
  python3 tools/make_candidates.py tools/screens/avidin.json
"""
import sys, json, os
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers
sys.path.insert(0, os.path.dirname(__file__))
from prepare_stage import DONOR, ACCEPTOR, HYDROPHOBIC, POSITIVE, NEGATIVE, find_rings, torsions

def pick_isomer(mol, wanted):
    """wanted: {"SMARTS": "R" など} で指定した立体配置の異性体を選ぶ"""
    if not wanted: return mol
    for iso in EnumerateStereoisomers(mol):
        Chem.AssignStereochemistry(iso, cleanIt=True, force=True)
        ok = True
        for smarts, label in wanted.items():
            match = iso.GetSubstructMatch(Chem.MolFromSmarts(smarts))
            if not match or iso.GetAtomWithIdx(match[0]).GetPropsAsDict().get("_CIPCode") != label: ok = False
        if ok: return iso
    raise SystemExit("指定した立体配置の異性体が見つからない: %s" % wanted)

def build(smiles, stereo=None):
    mol = pick_isomer(Chem.MolFromSmiles(smiles), stereo)
    mh = Chem.AddHs(mol)
    assert AllChem.EmbedMolecule(mh, randomSeed=7) == 0
    AllChem.MMFFOptimizeMolecule(mh, maxIters=2000)
    conf = mh.GetConformer()
    heavy = [a for a in mh.GetAtoms() if a.GetAtomicNum() > 1]
    index = {a.GetIdx(): i for i, a in enumerate(heavy)}
    atoms = []
    for a in heavy:
        el = a.GetSymbol().upper()
        hs = a.GetTotalNumHs(includeNeighbors=True)
        heavy_nb = [n for n in a.GetNeighbors() if n.GetAtomicNum() > 1]
        f = 0
        if el == "O":
            f |= ACCEPTOR
            if hs > 0: f |= DONOR
            if a.GetFormalCharge() < 0: f |= NEGATIVE
            # カルボン酸イオンは 2 つの酸素が等価
            for n in heavy_nb:
                if any(m.GetSymbol() == "O" and m.GetFormalCharge() < 0 for m in n.GetNeighbors()) and len(heavy_nb) == 1 and n.GetSymbol() == "C":
                    f |= NEGATIVE
        elif el == "N":
            if hs > 0: f |= DONOR
            if a.GetFormalCharge() > 0: f |= POSITIVE
            amide = any(n.GetSymbol() == "C" and any(b.GetBondTypeAsDouble() == 2 and b.GetOtherAtom(n).GetSymbol() == "O" for b in n.GetBonds()) for n in heavy_nb)
            if hs == 0 and a.GetFormalCharge() == 0 and a.GetIsAromatic() and a.GetDegree() == 2: f |= ACCEPTOR
            elif hs == 0 and a.GetFormalCharge() == 0 and not amide and not a.GetIsAromatic(): f |= ACCEPTOR
        elif el == "C":
            if not any(n.GetSymbol() in ("N", "O") for n in heavy_nb): f |= HYDROPHOBIC
        elif el in ("S", "CL", "BR", "I", "F"):
            f |= HYDROPHOBIC
        p = conf.GetAtomPosition(a.GetIdx())
        atoms.append({"name": "%s%d" % (a.GetSymbol(), index[a.GetIdx()] + 1), "el": el,
                      "x": round(p.x, 3), "y": round(p.y, 3), "z": round(p.z, 3), "flags": f})
    bonds = [(index[b.GetBeginAtomIdx()], index[b.GetEndAtomIdx()]) for b in mh.GetBonds()
             if b.GetBeginAtom().GetAtomicNum() > 1 and b.GetEndAtom().GetAtomicNum() > 1]
    bonds = [tuple(sorted(b)) for b in bonds]
    nb = {i: [] for i in range(len(atoms))}
    for i, j in bonds: nb[i].append(j); nb[j].append(i)
    lig = [{"el": a["el"], "name": a["name"], "xyz": [a["x"], a["y"], a["z"]]} for a in atoms]
    tors = torsions(lig, bonds, nb)
    # アミド結合のような、回らない二重結合性の結合は除く
    keep = []
    for t in tors:
        bond = mh.GetBondBetweenAtoms(heavy[t["a"]].GetIdx(), heavy[t["b"]].GetIdx())
        if bond.GetBondTypeAsDouble() == 1 and not bond.GetIsConjugated(): keep.append(t)
        elif bond.GetBondTypeAsDouble() == 1 and any(heavy[k].GetSymbol() == "C" and heavy[k].GetDegree() == 3 and
                 sum(1 for n in heavy[k].GetNeighbors() if n.GetSymbol() == "O") == 2 for k in (t["a"], t["b"])): keep.append(t)  # カルボン酸の付け根は回る
    return {"atoms": atoms, "bonds": [list(b) for b in bonds], "torsions": keep}

def main():
    spec = json.load(open(sys.argv[1]))
    out = {k: v for k, v in spec.items() if k != "candidates"}
    out["candidates"] = []
    for c in spec["candidates"]:
        lig = build(c["smiles"], c.get("stereo"))
        entry = {k: v for k, v in c.items() if k not in ("smiles", "stereo")}
        entry["ligand"] = lig
        out["candidates"].append(entry)
        print(c["id"], "atoms", len(lig["atoms"]), "torsions", len(lig["torsions"]), "flags", [a["flags"] for a in lig["atoms"]])
    path = os.path.join(os.path.dirname(__file__), "..", "data", spec["id"] + ".js")
    with open(path, "w") as f:
        f.write("// tools/make_candidates.py で自動生成。手で編集しない。\n")
        f.write("(function(g){(g.DOCKING_SCREENS=g.DOCKING_SCREENS||[]).push(")
        f.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        f.write(");})(typeof window!=='undefined'?window:globalThis);\n")

if __name__ == "__main__":
    main()
