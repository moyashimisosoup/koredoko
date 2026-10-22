# koredoko（これどこ）

公開されている不動産物件情報を、OpenPOIなどの施設データ・道路ネットワーク・建物属性と照合し、**条件に合う候補範囲と根拠・矛盾・未確認事項**を示すWebアプリの研究・開発リポジトリです。

## 目的と入力方式

- 物件広告URLからの情報抽出を目指します。サイトの規約・技術制約で取得できない場合は、利用者が適法に取得した文章や、AIが定型化した情報の貼り付けで代替します。
- 最寄り駅、徒歩分数、近隣施設、築年、構造、階数などの項目を、原文・取得元・取得日時とともに扱います。
- 公開POI、歩行者向け経路、公開建物属性を段階的に照合し、誤った確定表示を避けます。

## 状態（2026-10-22 JST）

- 正式APP-ID：**APP-023**。正本はこのPublicリポジトリ、計画・未完了の正本は[全体ROADMAP](docs/ROADMAP.md)と[工程再評価・品質優先計画](docs/APP023_DELIVERY_AND_QUALITY_PLAN_2026-10-22.md)。
- **全体マイルストーン：P0〜P5のうち完了はP0のみ（1/6）**。作業量の17%や位置推定の正解率を表す値ではありません。P1入力MVPは内部3/5項目を達成。P2施設横断の研究PoC・画面・既存経路もあるが地図と実広告入力の連携は未完成。P3の出典整理は開始済み、URL取得/貼付統合は未完了。
- 公開名称付き集合住宅を対象に、既存53歩行経路を維持し、ひばりヶ丘7広告・10物理施設、公開住所18地点、住所番号参照点13件、参考歩行API2経路を根拠付きで記録。**新地域の正式な品質認定済み経路は0本、独立の地理正解率は未測定**。
- Draft [PR #28](https://github.com/moyashimisosoup/koredoko/pull/28)で追加研究・品質監査を継続。GitHub Pagesの公開、PC/iPhoneでの実機検収、最新PRのmain統合は未実施。CIテスト成功は実機動作成功ではありません。
- **当面の開発優先順位**：広告の非JSON原文/JSON入力を既存施設統合エンジンへ接続し、候補比較＋地図＋根拠を一続きで表示。駅出口の個別調査は、参考順位や欠測判断に実質的な影響がある場合に限定します。

## 開発資料

- [全体ロードマップ](docs/ROADMAP.md)
- [R06 出入口座標の比較検証](docs/R06_EXIT_CROSSCHECK_2026-10-19.md)
- [P1 入力MVPの仕様・課題](docs/P1_INPUT_REVIEW_2026-10-19.md)
- [入力画面（開発中）](index.html)：定型JSONと原文の入力点検。GitHub Pages未公開
- [2026-10-19 CHECKPOINT（R06・P1）](docs/CHECKPOINT_R06_P1_2026-10-19.md)
- [実際の公開物件による入力・POI照合試験](docs/REAL_LISTING_TRIAL_2026-10-19.md)（CI合格、URL自動取得・物件位置推定は未実装）
- [公開UR4物件の擬似ブラインド検証](docs/BLIND_TRIAL_RESULTS_2026-10-19.md)：GSI住所参照点包含2/4件、駅代表点だけでは候補除外に不十分
- [複数徒歩条件の総合照合画面（PoC）](compare.html)：架空の4候補で徒歩条件3件＋建物属性2件を比較。Pages未公開
- [実データ歩行距離の計算画面](real-routes.html)：公開UR4物件・歩行者ルート9件を照合。Pages未公開
- [蒲田の公開UR4建物の比較画面](public-buildings.html)：共通3駅への実道路経路12本から条件別の参考順位を計算。Pages未公開
- [蒲田4建物・12経路の検証レポート](docs/KAMATA_REAL_CANDIDATES_2026-10-20.md)
- [2026-10-20 開発CHECKPOINT](docs/CHECKPOINT_KAMATA_2026-10-20.md)
- [徒歩経路の感度分析と誤順位検証](docs/ROUTE_SENSITIVITY_2026-10-20.md)：既存公開4建物で±100m/±200mの参考順位の入替可能性を検査
- [感度分析CHECKPOINT・出入口情報源と残課題](docs/CHECKPOINT_ROUTE_SENSITIVITY_2026-10-20.md)
- [公開建物の構造と徒歩距離の併用試験](docs/PUBLIC_STRUCTURE_COMPARISON_2026-10-20.md)：4建物の構造情報を導入し、徒歩のみの誤順位が変わることを開発用データで検証。外部正解率は未測定
- [2026-10-20 構造条件の最新CHECKPOINT](docs/CHECKPOINT_STRUCTURE_2026-10-20.md)
- [経路証拠の品質判定・公的赤羽歩行ネットワーク出典調査](docs/EVIDENCE_QUALITY_AND_AKABANE_NETWORK_2026-10-20.md)：入口・出口・道路版が未確認なら参考順位を判定保留。赤羽データはカタログのみ確認
- [証拠品質ゲートCHECKPOINT](docs/CHECKPOINT_EVIDENCE_QUALITY_2026-10-20.md)
- [王子神谷3公開物件の事前固定・実経路6本の比較画面](holdout-eval.html)：徒歩Top1/Top2と構造を別評価、Pages未公開
- [王子神谷・東十条3件の試験結果](docs/OJI_PRELOCKED_VALIDATION_2026-10-20.md)：徒歩のみTop1=1/3、Top2=3/3、構造は同源データなので独立評価でない
- [王子神谷公開住宅の疑似ブラインド評価CHECKPOINT](docs/CHECKPOINT_OJI_HOLDOUT_2026-10-20.md)
- [複数駅出口・住棟アクセス点の距離計算UI](endpoint-lab.html)：現行の実経路6本と仮の追加経路を厳密に区別して比較
- [複数出入口計算PoCと精度検証計画](docs/MULTI_ENDPOINT_DISTANCE_POC_2026-10-20.md)：従来の実データ・予測を保護し、次の新地域で前後比較
- [大島地区・公開UR5物件の次期検証](docs/OSHIMA_FIVE_PUBLIC_HOLDOUT_2026-10-20.md)：20経路の登録条件を事前固定、実取得17本・レート制限で3本欠測。採点保留
- [複数駅出口計算・大島5住宅 CHECKPOINT](docs/CHECKPOINT_MULTIPLE_EXITS_OSHIMA_2026-10-20.md)
- [施設と駅の距離を統合するWeb画面](facility-fusion.html)：公表施設3件と大島5公開住宅の距離帯・参考順位・候補の絞り込みを対話操作
- [施設横断距離統合 PoC](docs/FACILITY_FUSION_POC_2026-10-20.md)：20駅経路＋15施設歩行経路を統合し、POI出典、徒歩と直線を分離、非公開住戸を対象から除外
- [2026-10-20 施設横断計算CHECKPOINT](docs/CHECKPOINT_FACILITY_FUSION_2026-10-20.md)
- [実歩行経路・品質検証報告](docs/REAL_ROUTING_POC_2026-10-19.md)
- [複数条件照合エンジン仕様・検証計画](docs/MULTI_CONDITION_ENGINE_V0.1.md)
- [開発・品質管理上のルール](AGENTS.md)

## 安全と精度

- 居住者の個人情報や非公開住所の特定・公開を目的としません。
- 一つの候補が残っただけでは「確認済み」とは表示しません。根拠が弱い場合は判定保留とします。
- POI座標の誤り、駅出入口の位置誤差、広告の徒歩表示と経路距離の違いを明示的に扱います。
- Publicリポジトリへ秘密鍵、認証情報、非公開の掲載内容や個人情報を保存しません。

## 実装方針

ローカル環境のセットアップを必須としない、PC・スマートフォン両対応の軽量なWebアプリを目指します。必要に応じてAPI取得用の安全なバックエンドを追加します。
