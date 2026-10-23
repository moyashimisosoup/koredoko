# APP-023｜ひばりヶ丘の公式POI同定ゲート（2026-10-21）

検証段階：**PUBLIC_POI_NAMES_MATCHED / 経路未測定・未採点**。
引継ぎ元：[実広告7件の事前固定](HIBARI_REAL_AD_PRELOCK_2026-10-21.md)。
作業PR：[PR #28](https://github.com/moyashimisosoup/koredoko/pull/28)。

## 実装した成果

- [`examples/hibari_poi_identities_20261021.json`](../examples/hibari_poi_identities_20261021.json)：公開名付き施設**10物理施設**の名称、住所（公式掲載）、出典URL、別名、測量／出入口／歩行経路の未検証状態。
- [`src/public_ad_poi_readiness.mjs`](../src/public_ad_poi_readiness.mjs)：固定された広告7件と公式施設名を曖昧な自動推測なしに名寄せ。施設名が解決できても位置座標・出入口・道路経路は**未解決**として判定保留にする。
- [`tests/public_ad_poi_readiness.test.mjs`](../tests/public_ad_poi_readiness.test.mjs)：広告原値不変、同一PARCOの別名統合、原文矛盾の隔離、出典品質、位置・採点結果の非捏造、匿名化された評価準備出力を確認。
- 元の53経路、距離統合エンジン、既存の駅徒歩順位、仮施設距離UIは**変更していない**。

## 公式施設名・所在地・出典

| 物理施設ID（抜粋） | 名称 | 公的・運営元の根拠 | 座標／入口 |
| --- | --- | --- | --- |
| hibarigaoka-park | ひばりが丘公園 | [西東京市](https://www.city.nishitokyo.lg.jp/sisetu/koen_ryokuti/hibarigaoka.html) | 未確認 |
| nakahara-elementary | 西東京市立中原小学校 | [学校公式](https://www.nishitokyo.ed.jp/e-nakahara/index.html) | 未確認 |
| hibarigaoka-post-office | ひばりが丘郵便局 | [日本郵便](https://map.japanpost.jp/smt/search/inf/300100358000/) | 未確認 |
| hibarigaoka-parco | ひばりが丘PARCO | [PARCO公式](https://hibarigaoka.parco.jp/info/?gcd=facilities) | 未確認 |
| yato2-elementary | 西東京市立谷戸第二小学校 | [学校公式](https://www.nishitokyo.ed.jp/e-yato2/shokai/access.html) | 未確認 |
| seiyu-hibarigaoka | 西友ひばりヶ丘店 | [西友公式](https://www.seiyu.co.jp/shop/%E8%A5%BF%E5%8F%8B%E3%81%B2%E3%81%B0%E3%82%8A%E3%83%B6%E4%B8%98%E5%BA%97/) | 未確認 |
| yato-icho-park | 谷戸イチョウ公園 | [西東京市](https://www.city.nishitokyo.lg.jp/sisetu/koen_ryokuti/yatoityou.html) | 未確認 |
| yato-elementary | 西東京市立谷戸小学校 | [学校公式](https://www.nishitokyo.ed.jp/e-yato/shokai/index.html) | 未確認 |
| ikoinomori-park | 西東京いこいの森公園 | [西東京市](https://www.city.nishitokyo.lg.jp/sisetu/koen_ryokuti/ikoinomori.html) | 未確認 |
| yato-seseragi-park | 谷戸せせらぎ公園 | [西東京市](https://www.city.nishitokyo.lg.jp/sisetu/koen_ryokuti/yatoseseragi.html) | 未確認 |

## 独立評価への進捗と未完了

- 固定広告は**7件**、名称付き施設距離の原文は**16条件**。そのうち**14条件**は広告換算・距離方式について一次選別可、**2条件**は換算不整合／計測方式不明につき保留。
- **16/16条件**で施設の固有名を公式の物理施設10件へ照合できた。ただし独立出入口の位置は**0/10件**、新たな歩行経路観測は**0本**。
- 広告本文を直接確認できた3件で一次選別済みの施設条件は**6件**。ほか4広告8条件は公開検索索引での確認のみであり、完全原文の直接確認とは同等扱いにしない。
- 一次選別済み14条件に使われる固有名付き施設は**9物理施設**。7棟を候補として全施設を横断比較する場合、計算が必要となり得る**施設×候補の組合せ63組**、駅×候補は7組（計70組）。この件数は*計画上の最大比較組数*であり、実際のAPI取得件数・測定完了件数ではない。
- まだ対象7棟の公表建物参照点と施設アクセス点の独立的な座標由来・道路グラフ版が揃っていないため、いかなる地理推定Top1/Top3も報告しない。

## 入力分離と安全

広告原文にある建物名・住所・掲載ID・出典URLは**評価資料**には存在するが、採点へ渡す施設手がかりには含めない。Readinessモジュールはこれらの値を返さず、広告IDと公共POIの物理ID、未解決ゲートだけを返す。広告IDと候補IDの正解対応を推定ロジックに注入しないこと。

公園や学校は面積を持ち、公式住所の代表点は徒歩の終着点ではない。住所が確認されても緯度経度は入力せず、既存`public-facility-registry-v0.1`への流用は禁止。欠測の直線距離による補完も禁止。

## 次の操作

1. まず直接確認済みの3広告・**5種類の施設**に限定し、**公表建物7候補の住所参照点**と、公式公共施設の適切なアクセス点を一次ソース別に収集。入口未確認を明示して保存する。
2. 経路APIの利用条件・レート制限を確認し、必要最小数の新規徒歩経路を**取得されたものだけ**観測として蓄積。観測時刻、経路エンジン、版、入力点の根拠と吸着距離を記録。
3. 原文の直接確認が得られないH04〜H07は保留のまま、駅のみ→施設併用を同一候補集合・同じ重みで予測固定し、その後公表正解表と照合する。
4. 追加の経路が取得できなければ、距離・順位を合成せず**不足のまま**評価表に記録する。

全体計画P0〜P5は1/6完了のまま。GitHubへのコード保存、CI成功、実ブラウザ試験、Pages公開を混同しない。
