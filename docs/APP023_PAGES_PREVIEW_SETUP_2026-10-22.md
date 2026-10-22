# APP-023 GitHub Pagesプレビュー準備（2026-10-22 JST）

## 現在地

- 正本：moyashimisosoup/koredoko、Draft PR #28（マージしていない）。
- 検証用スナップショットブランチ：`preview/app023-iphone-20261022`。作成元HEADは`a65f42ba85ffabc0085dd578b0f9491203c7fdba`。
- 上記プレビューブランチに`.nojekyll`を追加済み。静的HTML、JavaScript、JSONをPagesで変換せず配信する準備。
- 既存`main`に変更なし。Pagesの設定画面操作は、ブラウザ自動操作サービスの残高不足で開始できず**未実施**。Pages有効化・配信URLへのアクセス・iPhone Safari動作は**未確認**。プレビューブランチ作成を公開成功と報告しない。
- 公開データはもともとPublicなリポジトリのファイルであるが、Pagesでは同じ静的ファイルがWebサイトとして誰でもアクセス可能になるため、公開範囲に注意。

## 設定のための残り1操作

[GitHub Pages 設定画面](https://github.com/moyashimisosoup/koredoko/settings/pages)で、Build and deployment → Source: `Deploy from a branch` → Branch: `preview/app023-iphone-20261022` → Folder: `/ (root)` → Save。

GitHubの状態がbuiltとなったことを確認後、**予想URL（未検証）**：`https://moyashimisosoup.github.io/koredoko/hibari-same-region.html` をiPhone Safariで開く。トップは同パスの`/`。配信確認できるまでURLを稼働済みと記録しない。

## 実機検収の最小セット

H02広告選択 → 7候補表示 → PARCO/建物の根拠 → 遠回り係数変更 → 広告本文貼付 → 不正JSON後にH03で復旧。

出典・欠測・暫定探索順・実測経路の違いを明示したまま操作確認。住所代表点を実際の出入口・建物のピンポイント位置と誤認させない。

## 次の状態更新

Pages設定を保存できた時点で、配信状態、ビルド履歴、実URLとiPhone Safari検収を**別々に**記録する。全体P0〜P5の正式な完了は依然1/6。
