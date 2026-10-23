import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=n=>readFileSync(new URL("../"+n,import.meta.url),"utf8");
test("new homepage opens the single-step area search instead of the research candidate dashboard",()=>{
 const h=page("index.html"),p=page("area.html");
 assert.ok(h.includes("url=./area.html"));
 assert.ok(p.includes("物件の情報を貼り付ける"));
 assert.ok(p.includes("このへんを探す"));
 assert.ok(p.includes('id="map"'));
 assert.ok(p.includes('id="advertisement"'));
 assert.ok(!p.includes('id="candidates"'));
 assert.ok(!p.includes('id="factor"'));
 assert.ok(!p.includes("公開住宅 K"));
});
test("small-screen UI uses one text input, one primary action and real geographic area map",()=>{
 const h=page("area.html");
 assert.equal((h.match(/<textarea /g)||[]).length,1);
 assert.equal((h.match(/class="go"/g)||[]).length,1);
 assert.ok(h.includes("@media(max-width:520px)"));
 assert.ok(h.includes("min-height:46px"));
 assert.ok(h.includes("200m格子"));
 assert.ok(h.includes("このあたりが候補です"));
 assert.ok(!h.includes('<svg id="map"')); // not a fake local-coordinate map
 assert.ok(h.includes("L.geoJSON(result.regions"));
 assert.ok(h.includes("tile.openstreetmap.org"));
 assert.ok(h.includes("OpenStreetMap contributors"));
 assert.ok(!h.includes("L.marker(")); // no estimated property pin
});
test("browser area UI handles text safely, never inserts private addresses or inferred property pin",()=>{
 const h=page("area.html");
 const js=h.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
 assert.ok(h.includes("makeAreaLandmarks,parseAreaInput,solveSearchArea"));
 assert.ok(h.includes("textContent"));
 assert.ok(!h.includes("innerHTML"));
 assert.ok(!h.includes("localStorage"));
 assert.ok(!h.includes("sessionStorage"));
 assert.ok(!h.includes("fetch(\"https"));
 assert.ok(!h.includes("building:K"));
 assert.ok(!h.includes("ひばりヶ丘プラザ"));
 assert.ok(h.includes("徒歩経路APIはまだ使用していません"));
 assert.ok(h.includes("OpenPOIの出典"));
 assert.ok(h.includes("広告全文や住所は送らず"));
});
test("legacy JSON inspector and experimental pages remain reachable by URL",()=>{
 const h=page("legacy-input.html");
 assert.ok(h.includes('id="payload"'));
 assert.ok(h.includes('id="check"'));
 assert.ok(h.includes("src/input_review.mjs"));
 assert.ok(page("hibari-same-region.html").includes("buildHibariSameRegionMapReview"));
});
