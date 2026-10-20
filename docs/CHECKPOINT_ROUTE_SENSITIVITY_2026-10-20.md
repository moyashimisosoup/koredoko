# APP-023 koredoko｜CHECKPOINT・距離感度分析 2026-10-20 JST

## 正本・根拠
- Repository: [moyashimisosoup/koredoko](https://github.com/moyashimisosoup/koredoko)
- [PR #15](https://github.com/moyashimisosoup/koredoko/pull/15) はmainへsquash統合済み
- main commit: `281f72f50cda61fde892dc3ad9dae99eb4375e97`（2026-10-20 JST GitHub読戻し）
- [CI #39352561680](https://github.com/moyashimisosoup/koredoko/actions/runs/39352561680)：Python 3.11 128/128、3.13 128/128、Node 24 115/115。失敗ジョブなし
- [計算](../src/route_sensitivity.mjs)、[追加テスト](../tests/route_sensitivity.test.mjs)、[操作画面](../public-buildings.html)、[方法・観測結果](ROUTE_SENSITIVITY_2026-10-20.md)

## 実施・確認済み
- 蒲田地区の公開UR4建物・3駅・12歩行経路のデータで、各経路の値を±0/50/100/200/400m動かす場合の「広告距離帯からの合計ずれ」の最小／最大を計算する実装を追加した。
- 比較画面に、距離変動幅の切り替え、参考順位の安定／入れ替わり可能性、端点道路吸着が25mを超えるという注意表示を追加した。
- 4広告の開発用試験では、±100mなら4件とも参考順位1位は入れ替わらない。一方、±200mでは4件とも入れ替わる可能性がある。
- 特に蒲田本町一丁目の広告は、±100mでも**別の物件が参考順位1位のまま安定**した。安定性と正解を混同しないルールを回帰テストで固定した。
- 既存テストのUI構文検査が複数のES Module importに対応するように修正した。
- 失敗した初回CIはPR #13で修正済み。今回のPR #15は最終CI成功・main統合・ファイル読戻し済み。

## 独立資料の調査結果
- JR東日本[蒲田駅の駅情報・改札案内](https://www.jreast.co.jp/estation/station/info.aspx?StationCd=478)は改札の種類を確認する一次情報として有用。
- 京急[京急蒲田駅案内](https://www.keikyu.co.jp/ride/kakueki/KK11.html)や[東急蒲田駅構内図](https://www.tokyu.co.jp/area/kamata/station/)は駅出口の配置・運営状態を確認する参考。
- [国土数値情報N02](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2023.html)は鉄道・駅形状データであり、駅出入口の独立測量座標とは断定できない。
- [MapFan駅出入口POIデータ](https://business.mapfan.com/service/db/point/station-and-entrance.php)には出入口を識別した座標データの製品が存在するが、**採用には提供契約・再利用許諾の確認が必要**。第三者座標や元データはこの公開リポジトリへ取り込んでいない。
- 正式座標の独立性・再利用条件が未確認のため、R06（駅出入口独立検証）は未完了のまま。

## 進捗：完成した機能と未完了の工程を区別
- 全体P0〜P5：1/6＝**17%**（変更なし）
- P1入力MVP：3/5＝**60%**（変更なし）
- 多条件照合PoC：5/6＝**83%**（外部評価E06未完了）
- 実経路PoC：4/5＝**80%**（実機L05未完了）
- 実建物比較：4/5＝**80%**（別地域独立評価M05未完了）
- 距離感度分析の新規Q01〜Q04（計算、UI、テスト、CI/main保存）：**4/4**。これは機能完了で、位置推定の正解率ではない。

## 正式に未完了
駅・建物の正式出入口の座標、道路グラフ版固定、独立地理データとの誤差較正、別地域の事前固定評価、GitHub Pages公開、PC/iPhone Safari実操作。**順位やスコアを真の所在地特定や確率と表現しない。**

## 次の1操作
運営主体から公開される出入口配置図と、再利用可能で座標の由来が追えるGIS出入口点の取得方法を調査し、独立測量と現況が立証できたデータだけを候補経路の正式端点へ昇格する。入手できなければ保留状態で、新しい公開建物集合の事前固定・外部検証へ進む。
