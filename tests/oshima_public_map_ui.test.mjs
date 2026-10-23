import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=()=>readFileSync(new URL("../public-map.html",import.meta.url),"utf8");
test("public-map uses all existing 5-public-housing, 4-station and 15-facility routes",()=>{
 const html=source();
 assert.ok(html.includes("oshima_five_complete_20routes_20261020.json"));
 assert.ok(html.includes("oshima_public_facilities_20261020.json"));
 assert.ok(html.includes("oshima_three_facilities_pedestrian_routes_20261020.json"));
 assert.ok(html.includes("buildOjimaPublicMapReview"));
 assert.ok(html.includes('id="plot"'));
 assert.ok(html.includes('id="detail"'));
 assert.ok(html.includes('id="candidates"'));
});
test("map UI is a responsive on-device coordinate scatter, not a misleading routeline map",()=>{
 const h=source();
 assert.ok(h.includes("aspect-ratio:1.25"));
 assert.ok(h.includes("道路の実経路形状は保存していないため"));
 assert.ok(h.includes("仮条件"));
 assert.ok(h.includes("徒歩経路"));
 assert.ok(h.includes("直線参考"));
 assert.ok(h.includes("個人情報の送信はしません"));
 assert.ok(h.includes("正解率・到達時間・特定確率ではありません"));
 assert.ok(!h.includes("L.tileLayer"));
 assert.ok(!h.includes("directions/v5"));
 assert.ok(!h.includes("new Mapbox"));
 assert.ok(!h.includes("innerHTML"));
 assert.ok(!h.includes("fetch(\"https:"));
});
test("relative coordinate plot supports keyboard accessible selectable public marker buttons",()=>{
 const h=source(),m=h.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(m);
 assert.doesNotThrow(()=>new Function(m.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
 assert.ok(m.includes('b.type="button"'));
 assert.ok(m.includes('setAttribute("aria-label"'));
 assert.ok(m.includes('p.xPct+"%"'));
 assert.ok(m.includes('p.yPct+"%"'));
 assert.ok(m.includes('dataset.selected'));
 assert.ok(m.includes('point.public_source_url'));
 assert.ok(m.includes("map_points"));
});
test("user-selected facility is not passed off as real UR advertising evidence",()=>{
 const h=source();
 assert.ok(h.includes("施設の距離条件は利用者が設定する"));
 assert.ok(h.includes("仮定"));
 assert.ok(h.includes("ユーザー仮定（実広告条件ではありません）"));
 assert.ok(h.includes("候補が距離帯に合わなくても確定除外はしません"));
});
