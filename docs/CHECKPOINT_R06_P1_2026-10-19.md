# APP-023「koredoko」CHECKPOINT：R06・P1（2026-10-19 JST）

## 保存・検証済み成果

- **正本**：[moyashimisosoup/koredoko](https://github.com/moyashimisosoup/koredoko) / main
- R06研究： [PR #3](https://github.com/moyashimisosoup/koredoko/pull/3) を [bdbb8f8](https://github.com/moyashimisosoup/koredoko/commit/bdbb8f82784496bb60337f1bb385866be1327eb9) でsquash統合。福岡市地下鉄の姪浜駅2出口・室見駅6出口について、旧実測データとOSM履歴を照合。**8件の相互座標差1.69〜12.55m**、中央値約6.64m。差は2データ間であって真位置の測量誤差ではない。
- R06テスト：[Actions #39219461960](https://github.com/moyashimisosoup/koredoko/actions/runs/39219461960) Python 3.11/3.13 で各**107/107件成功**。出典・座標差・ID重複・独立測量未証明の誤認抑止を検査。
- P1初稿：[PR #4](https://github.com/moyashimisosoup/koredoko/pull/4) を [451f62a](https://github.com/moyashimisosoup/koredoko/commit/451f62a5183ae99dea2f59c733ad10f5a2824be4) でsquash統合。index.htmlに貼付け式JSON検査、広告原文引用の存在点検、架空サンプル、AI抽出指示のコピーを実装。
- P1テスト：[Actions #39220400963](https://github.com/moyashimisosoup/koredoko/actions/runs/39220400963) Python 3.11/3.13 は各107件成功。Node.js 24による入力基本検査**16/16件成功**。アプリのブラウザ実操作は未確認。
- README・開発ルール・進捗文書はGitHubで読戻し確認。Session Deck台帳ではAPP-023として登録済み。

## 進捗：完了条件に基づく比率（予測工数や物件特定率ではない）

| 管理領域 | 算出方法 | 進捗 | 判定 |
| --- | --- | ---: | --- |
| 全体 P0〜P5 | P0完了のみ・6工程 | **1/6=17%** | P1〜P5の工程出口未達 |
| P1 入力UI 小工程 | I01〜I03完了・I04〜I05未完了 | **3/5=60%** | P1は未完了 |
| P4 歩行経路PoC | R01〜R05完了・R06〜R08未完了 | **5/8=63%** | R06は未完了 |
| R06 出入口照合 | R06a〜c完了・R06d〜e未完了 | **3/5=60%** | 資料独立性の確認不足 |

## 安全性・残課題

- OSMの2025年ノード編集時に航空画像が使われた形跡があっても、2018年の実測座標との**独立した測量**までは証明できない。R06を合格にしない。
- 正式な駅出入口の現況・正確な入口形状・道路グラフの版固定・異なる経路サービスによる交差検証は未完了。
- HTMLのURL欄は記録のみで、URLへのアクセスは行わない。ユーザーが貼り付けたJSONの「形式の基本点検」ができるだけで、広告記述の真偽を保証しない。
- ブラウザ側の簡易検査はPython JSON Schemaの完全な代替ではない。
- GitHub Pagesは未設定・未公開。Safari操作・実在する公開物件を用いた盲検精度評価はいずれも未実施。
- Publicリポジトリには個人の居住先や非公開データ、秘密情報を保存しない。出入口は公共施設のデータに限定。

## 次の1操作

1. R06d/e：駅運営主体の現況出入口座標を含む公開GIS資料など、2018年実測・OSMとは独立した位置測量根拠を探し、照合する。見つからない限り判定保留。
2. P1 I04：非JSONの定型文を安全に入力できる機構を検討し、I05でPC・iPhone Safariの実操作を検証する。
3. P2：候補範囲を根拠付きで可視化する（ただし個人宅のピンポイント特定は扱わない）。

**保存・CI合格・main統合・Web公開・実機動作確認を混同しない。**
