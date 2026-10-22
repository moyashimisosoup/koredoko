import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=()=>readFileSync(new URL("../ad-bridge.html",import.meta.url),"utf8");
test("home links to ad conditions screen and keeps old stable input PoC",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(html.includes("./ad-bridge.html"));
 assert.ok(html.includes('id="payload"'));
 assert.ok(html.includes('id="check"'));
 assert.ok(html.includes("src/input_review.mjs"));
});
test("three source modes and a direct source fixture can pass P1 to existing P2 matcher",()=>{
 const h=page();
 assert.ok(h.includes('value="locked"'));
 assert.ok(h.includes('value="text"'));
 assert.ok(h.includes('value="json"'));
 assert.ok(h.includes('value="H01"'));
 assert.ok(h.includes('value="H02"'));
 assert.ok(h.includes('value="H03"'));
 assert.ok(h.includes("bridgePastedPublicText"));
 assert.ok(h.includes("bridgeReviewedJson"));
 assert.ok(h.includes("compareBridgeAgainstPublicCandidates"));
 assert.ok(h.includes("施設条件を整理して比較"));
});
test("page imports proper module path and its inline module parses",()=>{
 const h=page();
 const body=h.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
 assert.ok(body);
 const staticImport=/^import .*? from "[^"]+";\s*$/gm;
 assert.doesNotThrow(()=>new Function(body.replace(staticImport,"")));
});
test("typed ad content stays client side and public buildings remain non-revealed",()=>{
 const h=page();
 assert.ok(!h.includes("innerHTML"));
 assert.ok(!h.includes("<form"));
 assert.ok(!h.includes("localStorage"));
 assert.ok(!h.includes("sessionStorage"));
 assert.ok(!h.includes("window.location.search"));
 assert.ok(!h.includes("msearch.gsi.go.jp"));
 assert.ok(!h.includes("valhalla1.openstreetmap.de"));
 assert.ok(!h.includes("fetch(\"https:"));
 assert.ok(!h.includes("C48269648"));
 assert.ok(!h.includes("ひばりヶ丘プラザ"));
 assert.ok(h.includes("評価は全件保留"));
 assert.ok(h.includes("入力内容は外部へ送信・保存しません"));
});
