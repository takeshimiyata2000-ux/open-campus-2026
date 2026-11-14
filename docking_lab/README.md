# ドッキングラボ（試作版）

`pocket_game/` を発展させた、手動ドッキングのゲームです。`pocket_game/` とは独立しています。

- 水素結合が成立すると、緑の点線と相手のアミノ酸名がその場で表示されます。
- スコアは 5 項目（水素結合、ポケットへの収まり、疎水性の接触、静電相互作用、衝突）の合計で、結晶構造のポーズを 100 点として換算します。
- 「答え合わせ」で、結晶構造の結合ポーズとのずれ（RMSD）を表示します。2 Å 以内を成功とします。
- 上級では、低分子の結合をスライダーでねじれます。

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` / `styles.css` / `app.js` | 画面と操作 |
| `scoring.js` | スコア関数と分子の幾何計算（ブラウザと Node の両方で動く） |
| `data/*.js` | ステージデータ（自動生成） |
| `tools/prepare_stage.py` | mmCIF からステージデータを作る |
| `tools/validate_scoring.js` | スコア関数の検証（再ドッキング試験） |

## ステージの追加

リガンドが入った結晶構造（mmCIF）から作ります。

```
cd docking_lab
python3 tools/prepare_stage.py ../pdb_cache/1avd.cif BTN A avidin-biotin \
  --meta '{"title":"…","pdbId":"1AVD","proteinName":"…","ligandName":"…","blurb":"…"}'
node tools/validate_scoring.js data/avidin-biotin.js 60
```

検証では、ランダムな位置からの探索で「結晶構造から離れているのに高得点」のポーズが出ないことを確認します。
出る場合は、そのステージはスコアと正解が食い違うので、ゲームの題材に向きません。
