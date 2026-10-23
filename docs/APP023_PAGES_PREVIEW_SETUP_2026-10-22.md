# APP-023｜GitHub Actions Pages公開・実HTTP確認 CHECKPOINT（2026-10-22 JST）

**状態：GitHub Pages実公開成功、HTTP静的ファイル確認成功、iPhone Safari実機未検収。**

## 公開URL（GitHub Pages正式deploymentの出力）

- [iPhone向け、同一地域の実広告・公開7候補の操作画面](https://moyashimisosoup.github.io/koredoko/hibari-same-region.html)
- [アプリトップ](https://moyashimisosoup.github.io/koredoko/)
- [広告入力・施設名寄せの試作](https://moyashimisosoup.github.io/koredoko/ad-bridge.html)
- [大島公開候補の参考位置関係図](https://moyashimisosoup.github.io/koredoko/public-map.html)

ユーザー自身が Settings > Pages の公開元を **GitHub Actions** に設定した。ブラウザ自動操作サービスは使用せず、GitHub Actions workflowのみでPagesへデプロイした。

## GitHubで確認した根拠

- 正本Repo：`moyashimisosoup/koredoko`（Public）。
- 公開元：`preview/app023-iphone-20261022`、ワークフロー `.github/workflows/pages-preview.yml`。サイトのHTML/JS/JSONは検収用スナップショット`a65f42ba85ffabc0085dd578b0f9491203c7fdba`に由来。ブランチ上ではCI/Pages構成のみ追加。
- **最初の試行 #39754507529 はデプロイ環境の段階で失敗**。ビルド成果物の作成は成功。
- **成功した最初のデプロイ：[Actions #39754750949](https://github.com/moyashimisosoup/koredoko/actions/runs/39754750949)**。公開専用環境`app023-iphone-preview`へ変更し、ビルドとdeploy両ジョブ成功。deploy-pagesのログに「Reported success!」「Evaluated environment url: https://moyashimisosoup.github.io/koredoko/」を確認。
- **公開されたURLの動作：[Actions #39754979967](https://github.com/moyashimisosoup/koredoko/actions/runs/39754979967)**。ビルド、Pages deploy、配信後HTTP GETの**3ジョブすべて成功**。GitHub Actionsランナーから以下5ファイルを`curl --fail`で取得し、それぞれの本文識別子を検査：
  - `index.html`
  - `hibari-same-region.html`
  - `src/hibari_same_region_map_view.mjs`
  - `src/hibari_partial_evidence_ranking.mjs`
  - `examples/hibari_real_ads_prelocked_20261021.json`
- 主なソース以外の秘密ファイルを公開しないよう、アーティファクトはHTML、srcのMJS、examplesのJSONのみに限定。元のソースRepoもPublicである。
- `main`は`4ecb87260c5907da9f84542c0ee8bac25177a543`を維持。Draft PR #28は未マージ。Pagesの公開はmain統合と独立した作業。

## 残る実機検収（次の1操作）

iPhone Safariで https://moyashimisosoup.github.io/koredoko/hibari-same-region.html を開き、H02広告→7候補→PARCO/建物の根拠→倍率変更→非JSON貼付→無効JSON後H03へ復帰を一巡。画面下端見切れ、キーボード、ピン重なりとスクロールだけ重点確認。

**未確認**：iPhone Safari実機での操作、一般広告での独立的中率、正式な入口・歩行経路の認定。公開/HTTP成功を位置推定品質や実機検収の成功とはしない。

正式マイルストーン P0〜P5 は P0のみ完了（1/6）。次はSafari上の操作感レビュー。
