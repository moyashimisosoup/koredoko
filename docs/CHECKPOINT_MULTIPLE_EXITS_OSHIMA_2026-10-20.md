# APP-023 CHECKPOINT｜複数出口計算基盤と大島5公開住宅の固定試験

確認：2026-10-20 JST  
正本：[moyashimisosoup/koredoko](https://github.com/moyashimisosoup/koredoko)  
コード最新main：`f11b48845a57bc23da656d684fffa75cbbbbef8a`（読戻し確認済み）

## マイルストーン① 複数の駅出口を扱う計算基盤

- [PR #23](https://github.com/moyashimisosoup/koredoko/pull/23) main統合。
- [src/multi_endpoint_routes.mjs](../src/multi_endpoint_routes.mjs) は公開建物×複数の駅出口の経路候補を扱い、**広告の距離帯に合わせた任意選択でなく最短の実測歩行経路**を採用する。
- 1経路のみの場合、蒲田4公開建物・12経路と王子神谷3公開建物・6経路の従来の参考順位・距離差に一致する回帰テストあり。
- [endpoint-lab.html](../endpoint-lab.html) では実測6経路と仮入力による経路追加を明確に分けた。仮の経路は実測データや評価用正解表に保存しない。
- [東京メトロ王子神谷駅などの出口番号カタログ](../examples/oji_exit_identifiers_no_coords_20261020.json) は公式案内等を根拠に収録。ただし駅出口の正確な座標と道路距離は0件しか得られておらず、**現実の位置計算の精度向上は未確認**。
- [CI #39379588560](https://github.com/moyashimisosoup/koredoko/actions/runs/39379588560)：Python3.11/3.13 各128件、Node24 177件成功。

## マイルストーン② 別地域・公開5候補の評価準備

- [PR #24](https://github.com/moyashimisosoup/koredoko/pull/24) main統合。
- 江東区のUR公表名称付き住宅5件、4駅の代表点、各公式徒歩条件を、経路取得前に[事前固定](../examples/oshima_five_preregistered_20261020.json)。
- [大島5住宅の途中観測](../examples/oshima_five_partial_17routes_20261020.json)では、20件中17件の実際のValhalla歩行経路を取得、**3件は取得環境のレート制限により欠測**。アクセス制限を迂回しない。元の出発点・駅座標・広告徒歩分数は変えない。
- [src/locked_cohort_readiness.mjs](../src/locked_cohort_readiness.mjs) は事前固定の候補・徒歩条件・座標の改変を防ぎ、20本全件の観測が揃うまでは**Top1/Top3の正解率採点を明示的に拒否**。偽の0mや中央値で埋めない。
- [CI #39380671051](https://github.com/moyashimisosoup/koredoko/actions/runs/39380671051)：Python3.11/3.13 各128件、Node24 187件成功。
- [詳細・失敗した3経路](OSHIMA_FIVE_PUBLIC_HOLDOUT_2026-10-20.md)。

## 計測・進捗を混同しない

| 項目 | 現在の確認値 |
| --- | --- |
| 公開UR候補の重複なしの研究対象 | 蒲田4＋王子神谷3＋大島5＝12物件 |
| 実歩行経路の研究用観測 | 蒲田12＋王子神谷6＋大島17＝35本 |
| 現在の大島コホート | 17/20本、**Top1/Top3は未採点** |
| 別地域・王子神谷3広告での徒歩参考順位 | Top1 1/3、Top2 3/3、確定判定は全件保留 |
| 物件構造併用の開発用結果 | 同一UR一次資料のため外部精度・真の正解率とはみなさない |
| 現実の複数出口ルートの追加実測 | 0本。基盤のみ実装 |
| 駅・建物入口の独立実測、歩行道路網の版固定 | 未完了 |
| 本番公開、PC/iPhone Safari実機手動検収 | 未完了 |
| 全体ロードマップP0〜P5 | **1/6＝17%（変更なし）** |

## 次の一操作

公開ルーティングサービスの利用条件が許す時点で**大島の欠測3経路だけ**を適切に取得し、20本の整合性と固定モデルの再現性を検証する。その後、**予測結果を保存してから正解と照合**し、5候補のTop1/Top3・保留率を結果に記録する。駅出口の独立座標が得られれば複数出口への距離改善も新旧比較するが、特定地点を過剰に検査しない。追加評価は別地域の新しい公開コホートで実施し、以前のデータへ後付け調整しない。

現在のリポジトリはPublicであるため、非公開住戸・個人識別情報を一切投入しない。GitHub Pagesの公開には別承認が必要。
