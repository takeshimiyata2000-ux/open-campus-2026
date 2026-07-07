# オープンキャンパス2026 デモ

食品化学研究室のオープンキャンパス用デモ資料です。

## ポケット探索ゲーム

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
http://127.0.0.1:8787/pocket_game/?v=14
```

## 必要ファイル

- `pocket_game/3Dmol-min.js`
- `pocket_game/catechin.sdf`
- `pdb_cache/1blf.cif`

これらを含めておけば、ネット接続なしでもローカルサーバー経由で動作します。
