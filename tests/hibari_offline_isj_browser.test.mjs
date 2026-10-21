import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=()=>readFileSync(new URL("../isj-review.html",import.meta.url),"utf8");
test("browser-only ISJ review has CSV input, dataset-year input, and source attribution",()=>{
 const html=page();
 assert.ok(html.includes('type="file"'));
 assert.ok(html.includes('id="year"'));
 assert.ok(html.includes("街区レベル位置参照情報 国土交通省"));
 assert.ok(html.includes("https://nlftp.mlit.go.jp/isj/agreement.html"));
 assert.ok(html.includes("./src/hibari_offline_isj_match.mjs"));
});
test("file review does not upload local CSV or scrape distant coordinates",()=>{
 const html=page();
 assert.ok(!html.includes("<form"));
 assert.ok(!html.includes("innerHTML"));
 assert.ok(html.includes("TextDecoder(\"shift_jis\""));
 assert.ok(html.includes("readAsArrayBuffer")||html.includes("file.arrayBuffer()"));
 assert.ok(html.includes("fetch(\"./examples/\"+name"));
 assert.ok(!html.includes("valhalla1.openstreetmap.de"));
 assert.ok(!html.includes("msearch.gsi.go.jp"));
});
test("inline module code is parseable and no true-entrance verification is claimed",()=>{
 const html=page();
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Function(code.replace(/^import .*? from "[^"]+";/gm,"")));
 assert.ok(html.includes("入口確認0件"));
});
test("home page makes review UI discoverable without changing public-location disclaimer",()=>{
 const home=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(home.includes("./isj-review.html"));
 assert.ok(home.includes("現時点では所在地の推定や地図照合を行いません。"));
});