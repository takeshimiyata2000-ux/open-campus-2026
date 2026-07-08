# オープンキャンパス2026 デモ

食品化学研究室のオープンキャンパス用デモ資料です。

## 分子ドッキング ポケット探索ゲーム

タンパク質の白いsurfaceのくぼみに低分子を置いて、ハマり具合をスコア判定するゲームです。
複数ステージを切り替えられ、高得点を出すと音と紙吹雪で祝福します。

各ステージにはミッション文と制限時間（画面右上にカウントダウン）があり、
50点以上でクリア。ハイスコアとベストタイムはブラウザに保存され、
ステージ名の横に「★スコア」として表示されます（`localStorage` 利用）。

### ステージ

1. **ラクトフェリン × カテキン** — 食品成分（茶ポリフェノール）をミルク由来タンパク質に。
2. **ラクトフェリン × 抗菌薬** — 標的タンパク質にアンピシリンをドッキング。
3. **コレラトキシン × GM1** — Bサブユニットが宿主細胞表面のGM1ガングリオシド糖鎖に結合する様子を体験。

### 起動

Chromeで以下を開きます。

```text
pocket_game/index.html
```

ローカルで確実に動かす場合は、このフォルダでサーバーを起動します。

```bash
python3 -m http.server 8787
```

その後、Chromeで開きます。

```text
http://127.0.0.1:8787/pocket_game/
```

## 必要ファイル

- `pocket_game/3Dmol-min.js`
- `pocket_game/catechin.sdf`
- `pocket_game/ligands/ampicillin.sdf`
- `pocket_game/ligands/gm1_pentasaccharide.sdf`
- `pdb_cache/1blf.cif`（ラクトフェリン）
- `pdb_cache/1xtc.cif`（コレラトキシン）

これらを含めておけば、ネット接続なしでもローカルサーバー経由で動作します。

### 低分子データの出典

`pocket_game/ligands/` のSDFは以下を利用しています。
- アンピシリン（PubChem CID 6249）ほか ciprofloxacin・galactose・lactose・sialic_acid（PubChem 3D構造）
- `gm1_pentasaccharide.sdf` は PDB 3CHB（コレラトキシンB–GM1複合体）に結合したGM1五糖の実座標から抽出し、
  原子間距離で結合を再構成したもの。

### ステージ・低分子の追加

`pocket_game/app.js` 冒頭の `STAGES` 配列に、`protein`（CIFパス）・`ligand`（SDFパス）・
表示名・説明を追加するだけで新しいステージを増やせます。
