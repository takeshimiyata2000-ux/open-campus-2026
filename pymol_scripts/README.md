# Open Campus PyMOL Scripts

PyMOLで `File > Run Script...` から `.pml` ファイルを選ぶと、展示用の表示に切り替わります。

## Scripts

- `01_lactoferrin_iron_site.pml`
  - ラクトフェリンの鉄結合部位を見せるミッション。
- `01a_lactoferrin_find_iron_question.pml`
  - 来場者がラクトフェリン中の鉄を探す問題画面。
- `01b_lactoferrin_find_iron_answer.pml`
  - 鉄の位置と周辺アミノ酸を表示する答え合わせ画面。
- `01_lactoferrin_find_iron_scenes.pml`
  - 1本のスクリプト内で `question` / `answer` シーンを作る版。
- `02_cholera_toxin_subunits.pml`
  - コレラトキシンのサブユニット構造を色分けして見せるミッション。
- `03_ligand_pocket_demo.pml`
  - タンパク質に結合した小分子と、その周辺アミノ酸を見せる汎用ミッション。

## Notes

- スクリプト内の `fetch` はインターネット接続が必要です。
- 当日ネットが不安な場合は、事前にPyMOLで一度実行して構造を保存しておくか、PDBファイルをローカルに用意してください。
- 構造によって鎖名やリガンド名が違うことがあります。最終的に使うPDBを決めたら、残基番号を固定した「当日版」に調整すると安定します。
