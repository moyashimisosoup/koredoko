import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=()=>readFileSync(new URL("../route-readiness.html",import.meta.url),"utf8");
test("route audit webpage exposes both 42 and 70 pair planning scopes",()=>{
 const s=html();
 assert.ok(s.includes("最大42経路"));
 assert.ok(s.includes("最大70経路"));
 assert.ok(s.includes('id="observations"'));
 assert.ok(s.includes('id="planned"'));
 assert.ok(s.includes('id="observed"'));
 assert.ok(s.includes('id="missing"'));
});
test("page uses evidence-only audit and does not compute fake routes or upload local JSON",()=>{
 const s=html();
 assert.ok(s.includes("auditHibariRouteObservations"));
 assert.ok(s.includes("buildHibariRouteCoverage"));
 assert.ok(s.includes('fetch("./examples/"+file'));
 assert.ok(s.includes("file.text()"));
 assert.ok(!s.includes("innerHTML"));
 assert.ok(!s.includes("<form"));
 assert.ok(!s.includes("valhalla1.openstreetmap.de"));
 assert.ok(!s.includes("msearch.gsi.go.jp"));
 assert.ok(!s.includes("fetch(\"https:"));
});
test("module source parses after removing static imports; home links to route audit page",()=>{
 const s=html();
 const code=s.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Function(code.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
 const home=readFileSync(new URL("../legacy-input.html",import.meta.url),"utf8");
 assert.ok(home.includes("./route-readiness.html"));
});
test("publicly known building names and correct advertisement mappings are not in audit screen",()=>{
 const s=html();
 assert.ok(!s.includes("グランフォーレひばりが丘"));
 assert.ok(!s.includes("HIBARI TOWER"));
 assert.ok(!s.includes("ひばりヶ丘プラザ"));
 assert.ok(!s.includes("K03=H02"));
 assert.ok(s.includes("独立正解率：未測定"));
});

test("two actual exploratory route outputs are displayed but excluded from primary quality-qualified observations",()=>{
 const html=()=>readFileSync(new URL("../route-readiness.html",import.meta.url),"utf8");
 const s=html();
 assert.ok(s.includes('id="pilotStatus"'));
 assert.ok(s.includes('id="pilotRows"'));
 assert.ok(s.includes("hibari_v2_exploratory_walks_20261022.json"));
 assert.ok(s.includes("summarizeHibariReferenceWalkPilot"));
 assert.ok(s.includes("品質確認済み："));
 assert.ok(s.includes("上の採点用記録数には加えません"));
});

test("measured route geometry offsets appear as reference-point differences, not surveyed entrance positions",()=>{
 const html=readFileSync(new URL("../route-readiness.html",import.meta.url),"utf8");
 assert.ok(html.includes("hibari_v2_route_shape_offsets_20261022.json"));
 assert.ok(html.includes("auditHibariPilotRouteShapeOffsets"));
 assert.ok(html.includes("start_reference_to_geometry_m"));
 assert.ok(html.includes("station_reference_to_geometry_m"));
 assert.ok(html.includes("これは正式な道路吸着距離や建物入口・駅出口の位置精度を示しません"));
 assert.ok(html.includes("品質確認済み"));
});
