# APP-023｜実経路2本のポリライン端点差・駅出入口監査（2026-10-22）

**状態：REFERENCE_GEOMETRY_ENDPOINTS_AUDITED / OFFICIAL_EXIT_COORDINATES_MISSING / SCORING_ROUTES_0**

## 確認した根拠

- 対象：ひばりヶ丘の名前と所在地が公開されている集合住宅2棟（匿名候補K03・K05）から、西武鉄道ひばりヶ丘駅へ向かう公共道路の参考経路2本。Privateの住戸・居住者・個人住所は扱わない。
- 直前の[2本の実経路](../examples/hibari_v2_exploratory_walks_20261022.json)を**同一GET URLで再照会**。Valhalla public demoが返す\`trip.legs[0].shape\`（polyline6）を独立に復号した。[Valhalla公式 polyline6 仕様](https://valhalla.github.io/valhalla/api/decoding/)、[route API reference](https://valhalla.github.io/valhalla/api/turn-by-turn/overview/)。
- [実応答の線形状と端点差](../examples/hibari_v2_route_shape_offsets_20261022.json)を保存し、[品質監査コード](../src/hibari_route_shape_endpoint_audit.mjs)で元の出発点・目的点・要求URLと再照合した。

| 公開候補→駅 | 経路長（実API応答） | route polylineの頂点数 | 住所番号参照点→経路始点 | 駅住所参照点→経路終点 |
| --- | ---: | ---: | ---: | ---: |
| K03 | 298m | 18 | 11.22m | 5.00m |
| K05 | 335m | 17 | 0.48m | 5.00m |

**測定法**：住所番号データの参照点と、Valhallaのpolyline6の最初・最後の頂点とのHaversine直線距離。**これは正式な道路吸着距離の独立測量値ではない**。各端点がOSM歩道グラフのどのエッジへcorrelateされたかは未検証。まして、建物玄関・敷地正門・駅改札・駅南北口の位置精度を表す数値ではない。末尾駅側5.00mという一致は同じ公開駅住所番号参照点とAPI道路グラフを両経路が使ったためで、2つの独立した観測結果ではない。

## 駅出入口と建物アクセスの一次資料

- [西武鉄道「ひばりヶ丘駅」公式駅情報](https://www.seiburailway.jp/railway/station/hibarigaoka/)：駅住所は住吉町3丁目9番19号。住所そのものは出口の地理座標ではない。
- [西武鉄道「ひばりヶ丘駅リニューアル」](https://www.seiburailway.jp/safety/stationrenewal/hibarigaoka/)：北口・南口のエスカレーター改修などに言及し、複数の公的アクセス方向を裏付ける。ただしページの文章だけでは各出口の精密座標、公共歩道への接点、今回の参照点の対応する出口は確定できない。
- [公益財団法人交通エコロジー・モビリティ財団の駅情報](https://www.ecomo-rakuraku.jp/ja/station/%E3%81%B2%E3%81%B0%E3%82%8A%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89/)：駅住所、地上出入口と改札間のバリアフリー動線の存在などを確認。位置の精密座標は示されない。
- K03 ひばりヶ丘プラザ：[公開分譲建物プロフィール](https://library.smtrc.jp/mansion/563946.html)は谷戸町3丁目27番24号と駅徒歩3分を掲載するが、周辺地図アイコンと現地の位置が異なる場合の警告がある。
- K05 グランフォーレひばりが丘：[公開建物資料](https://www.sumai1.com/buyers/mansion/library/mns_29235)の住所と建物名を参照。敷地出入口や道路接点の正確な座標を公開資料だけでは検証できていない。

[駅と建物出入口のエビデンス台帳](../examples/hibari_station_public_exit_gate_20261022.json)を追加。**北口・南口の名称は確定、具体的出入口点0件、建物アクセス確認0件**。公開建物と既知駅の参考距離を広告の客観的な最短徒歩距離として確定したわけではない。

## 今回のコードと検査

1. [\`src/hibari_route_shape_endpoint_audit.mjs\`](../src/hibari_route_shape_endpoint_audit.mjs)：polyline6復号・Haversine端点差・元のGET経路・匿名候補計測計画と照合。形状改ざん、メタデータ改ざん、入口認定偽装、route request改ざんを拒否。
2. [\`tests/hibari_route_shape_endpoint_audit.test.mjs\`](../tests/hibari_route_shape_endpoint_audit.test.mjs)、[\`tests/hibari_station_public_exit_gate.test.mjs\`](../tests/hibari_station_public_exit_gate.test.mjs)で実取得値の端点差と、住所参照点が出入口扱いに変換されないことを回帰監査。
3. [\`route-readiness.html\`](../route-readiness.html)：実取得2経路を「採点用42/70件の欠測監査」と別枠で表示し、経路形状の両端と入力座標の差を参考数値として可視化。ユーザーCSV・JSON送信や大量の外部API呼出しはしない。**実機ブラウザでの動作確認はまだしていない。**

## 現在の成果とゲート

| 区分 | 確認できた値 | 未確認事項 |
| --- | --- | --- |
| 町丁目 | 18/18住所一致、8町丁目代表点 | 建物位置の精度 |
| 住居表示番・号 | 13/18件一致 | K01不一致、4公園の号なし、古さ |
| Valhalla参考歩行 | 2本（298m、335m） | 実際の歩行の最短経路・アクセス |
| 経路形状端点差 | 2本両端（約0.48～11.22m） | エッジ相関や構内動線 |
| 駅の複数出入口名称 | 北口・南口 | 正確な出口座標、建物の徒歩ゲート |
| **採点に使える品質認定経路** | **0本** | 端点・使用条件・盲検比較 |
| **独立Top1/Top3** | **未測定** | 正解照合 |

既存の53観測経路、広告H01～H07の原文・16条件、候補ID K01～K07、採点閾値、\`main\`を改変しない。P0～P5はP0のみ完了（1/6）。Draft PR #28、Pages未公開。

**次の1操作**：西武鉄道の構内図／公道の徒歩出入口と、公開集合住宅K03・K05の敷地アクセス点について**現地資料または公的図面の座標根拠**を取得する。入口種類を確認し、行先の駅出口を選定できた場合のみ、歩行ルートを再取得して品質認定テーブルへ段階的に移す。入口が根拠不足なら保留のままにする。
