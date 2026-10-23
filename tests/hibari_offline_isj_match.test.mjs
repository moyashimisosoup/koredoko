import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeJapaneseBlockString,parseNishitokyoBlock,parseCsvRecords,parseIsjBlocks,matchPublicBlockAddresses}
 from "../src/hibari_offline_isj_match.mjs";
const load=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const buildings=()=>load("hibari_public_building_addresses_20261021.json");
const pois=()=>load("hibari_poi_identities_20261021.json");
const HEADER=["都道府県名","市区町村名","大字・町丁目名","小字・通称名","街区符号・地番",
"座標系番号","Ｘ座標","Ｙ座標","緯度","経度","住居表示フラグ","代表フラグ","更新前履歴フラグ","更新後履歴フラグ"].join(",");
const row=(area,block,lat,lon,rep="1",history="0")=>
 ["東京都","西東京市",area,"",block,"9","0","0",String(lat),String(lon),"1",rep,"0",history].join(",");
const CSV=[HEADER,
row("谷戸町三丁目","27",35.75123,139.54678),
row("谷戸町三丁目","28",35.75005,139.54755),
row("ひばりが丘三丁目","2",35.74621,139.53155),
row("ひばりが丘三丁目","3",35.745,139.529, "1","3"),
row("谷戸町三丁目","27",35.75000,139.54899,"0"),
row("谷戸町三丁目","29",35.75000,139.54899,"0"),
row("谷戸町三丁目","999",35.751,139.5,"1","3")
].join("\r\n");
test("normalizes kanji and fullwidth street numbers without losing Japanese town names",()=>{
 assert.equal(normalizeJapaneseBlockString("谷戸町三丁目二十七番"),"谷戸町3丁目27番");
 assert.equal(normalizeJapaneseBlockString("ひばりが丘１丁目２番"),"ひばりが丘1丁目2番");
 assert.deepEqual(parseNishitokyoBlock("東京都西東京市谷戸町3丁目27番24号"),
  {city:"西東京市",town:"谷戸町",chome:3,block:27});
 assert.deepEqual(parseNishitokyoBlock("東京都西東京市谷戸町三丁目２７番"),
  {city:"西東京市",town:"谷戸町",chome:3,block:27});
});
test("rejects unknown city, town-only query, and nonnumeric block",()=>{
 assert.equal(parseNishitokyoBlock("東京都武蔵野市谷戸町3丁目27番"),null);
 assert.equal(parseNishitokyoBlock("東京都西東京市谷戸町3丁目"),null);
 assert.equal(parseNishitokyoBlock("東京都西東京市谷戸町3丁目A27番"),null);
});
test("CSV parser reads quoted fields and CRLF, rejecting unclosed quoted cells",()=>{
 assert.deepEqual(parseCsvRecords('a,"b,c"\r\nx,"y""z"\r\n'),[["a","b,c"],["x",'y"z']]);
 assert.throws(()=>parseCsvRecords('a,"b'),/Unclosed/);
});
test("MLIT ISJ parser consumes synthetic CSV and excludes deleted historical rows",()=>{
 const d=parseIsjBlocks(CSV);
 assert.equal(d.records.length,5);
 assert.equal(d.discarded,2);
 assert.ok(d.records.every(x=>x.location_kind==="MLIT_ISJ_block_representative_not_entrance"));
 assert.equal(d.records[0].town,"谷戸町");
 assert.equal(d.records[0].block,27);
 assert.equal(d.records[0].representative,true);
});
test("does not confuse another block number with source address",()=>{
 const d=parseIsjBlocks(CSV);
 const c=matchPublicBlockAddresses(buildings(),pois(),d,{datasetYear:2025,fileName:"synthetic_TEST.csv"});
 const p=c.results.find(x=>x.key==="building:K03"); // Yato 3-27 address
 assert.equal(p.status,"single_block_reference_review_needed");
 assert.equal(p.reference_points.length,1);
 assert.equal(p.reference_points[0].lat,35.75123);
 assert.equal(p.reference_points[0].entrance_verified,false);
 assert.equal(p.can_route,false);
 const other=c.results.find(x=>x.key==="building:K01"); // Hibarigaoka 3-2
 assert.equal(other.reference_points.length,1);
 assert.equal(c.scoring_ready,false);
 assert.equal(c.observed_pedestrian_routes,0);
});
test("CSV row without a representative flag does not override representative row",()=>{
 const c=matchPublicBlockAddresses(buildings(),pois(),parseIsjBlocks(CSV),
  {datasetYear:2025,fileName:"synthetic_TEST.csv"});
 const p=c.results.find(x=>x.key==="building:K03");
 assert.equal(p.reference_points.length,1);
 assert.equal(p.reference_points[0].lon,139.54678);
});
test("multiple valid representative points remain explicitly ambiguous",()=>{
 const extra=CSV+"\r\n"+row("谷戸町三丁目","27",35.752,139.547,"1");
 const c=matchPublicBlockAddresses(buildings(),pois(),parseIsjBlocks(extra),
  {datasetYear:2025,fileName:"synthetic_TEST.csv"});
 const p=c.results.find(x=>x.key==="building:K03");
 assert.equal(p.status,"multiple_block_references_review_needed");
 assert.equal(p.reference_points.length,2);
 assert.equal(p.can_route,false);
});
test("missing source metadata or wrong CSV shape prevents accepting coordinates",()=>{
 assert.throws(()=>parseIsjBlocks("wrong,header\n1,2"),/Unsupported/);
 assert.throws(()=>matchPublicBlockAddresses(buildings(),pois(),parseIsjBlocks(CSV),{datasetYear:2025}),/provenance/);
});
test("all eighteen candidate/public facility address references stay unverified even when synthetic CSV matches",()=>{
 const c=matchPublicBlockAddresses(buildings(),pois(),parseIsjBlocks(CSV),
  {datasetYear:2025,fileName:"synthetic_TEST.csv"});
 assert.equal(c.public_sources,18);
 assert.ok(c.results.every(x=>x.can_route===false));
 assert.equal(c.source_file,"synthetic_TEST.csv");
 assert.equal(c.dataset_source,"https://nlftp.mlit.go.jp/isj/");
 assert.ok(!JSON.stringify(c).includes("ひばりヶ丘プラザ"));
});