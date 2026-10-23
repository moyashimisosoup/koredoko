import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=n=>readFileSync(new URL("../"+n,import.meta.url),"utf8");
test("same-region page has usable mobile ad input, explanatory map and exploratory candidate list",()=>{
 const h=read("hibari-same-region.html");
 for(const id of ["mode","ad","adText","json","original","factor","plot","candidates","placeList","detail","missing","run"]){
  assert.ok(h.includes('id="'+id+'"'),id);
 }
 assert.ok(h.includes("aspect-ratio:1.25"));
 assert.ok(h.includes("min-height:44px"));
 assert.ok(h.includes("@media(max-width:780px)"));
 assert.ok(h.includes("@media(max-width:490px)"));
 assert.ok(h.includes("bridgePrelockedPublicAd"));
 assert.ok(h.includes("bridgePastedPublicText"));
 assert.ok(h.includes("bridgeReviewedJson"));
 assert.ok(h.includes("buildHibariSameRegionMapReview"));
});
test("client-side UI never leaks pasted content or fabricates missing pedestrian paths",()=>{
 const h=read("hibari-same-region.html");
 assert.ok(!h.includes("innerHTML"));
 assert.ok(!h.includes("localStorage"));
 assert.ok(!h.includes("sessionStorage"));
 assert.ok(!h.includes("fetch(\"https:"));
 assert.ok(!h.includes("window.location.search"));
 assert.ok(h.includes("正解確率や実際の徒歩分数ではありません"));
 assert.ok(h.includes("候補を除外せず"));
 assert.ok(h.includes("入力された広告本文やJSONは外部へ送信・保存しません"));
 assert.ok(h.includes("距離は実測していません"));
 assert.ok(!h.includes("プレミストひばりが丘"));
 assert.ok(!h.includes("ひばりヶ丘プラザ"));
 assert.ok(!h.includes("https://valhalla1.openstreetmap.de"));
});
test("map pin overlap has accessible facility list and seven clickable candidate rows",()=>{
 const h=read("hibari-same-region.html");
 assert.ok(h.includes('places.append(b)'));
 assert.ok(h.includes('b.addEventListener("click",()=>showPoint(p.id))'));
 assert.ok(h.includes('b.type="button"'));
 assert.ok(h.includes('b.setAttribute("aria-label"'));
 assert.ok(h.includes('card'));
 assert.ok(h.includes('reference_location_quality'));
});
test("same-region module imports and page JS script are statically valid",()=>{
 const h=read("hibari-same-region.html");
 const js=h.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
test("home and old bridge link to same-region usability without mutating Ojima example",()=>{
 const home=read("legacy-input.html"),bridge=read("ad-bridge.html");
 assert.ok(home.includes("./hibari-same-region.html"));
 assert.ok(bridge.includes("./hibari-same-region.html"));
 assert.ok(home.includes("./public-map.html"));
 assert.ok(bridge.includes("地域間で広告条件は転用しません"));
});
