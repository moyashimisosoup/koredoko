import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bridgePrelockedPublicAd,bridgePastedPublicText,bridgeReviewedJson,compareBridgeAgainstPublicCandidates}
 from "../src/ad_input_bridge.mjs";
const file=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const ads=()=>file("hibari_real_ads_prelocked_20261021.json");
const pois=()=>file("hibari_poi_identities_20261021.json");
const buildings=()=>file("hibari_public_building_addresses_20261021.json");
test("direct H01 ad transports only 2 published physical POI clues; station without excerpt stays withheld",()=>{
 const a=bridgePrelockedPublicAd(ads(),pois(),"H01");
 assert.equal(a.eligible_walking_clues,2);
 assert.equal(a.withheld_clues,1);
 assert.equal(a.conditions[0].min_minutes,3);
 assert.equal(a.conditions[1].min_minutes,11);
 assert.equal(a.conditions[0].place_id,"nishitokyo:hibarigaoka-park");
 assert.equal(a.withheld[0].reason,"missing_station_verbatim_excerpt");
 assert.ok(a.conditions[0].advertised_excerpt.includes("約230"));
});
test("H02 inconsistent 1537m=15min is withheld, H03 unknown 590m travel mode withheld",()=>{
 const b=bridgePrelockedPublicAd(ads(),pois(),"H02");
 assert.equal(b.eligible_walking_clues,2);
 assert.equal(b.withheld_clues,2);
 assert.ok(b.withheld.some(x=>x.reason==="published_clue_quarantined"));
 const c=bridgePrelockedPublicAd(ads(),pois(),"H03");
 assert.equal(c.eligible_walking_clues,2);
 assert.equal(c.withheld_clues,2);
 assert.ok(c.withheld.some(x=>x.reason==="published_clue_quarantined"));
});
test("indexed four ads do not become high-quality sources despite public names",()=>{
 for(const id of ["H04","H05","H06","H07"]){
  const b=bridgePrelockedPublicAd(ads(),pois(),id);
  assert.equal(b.eligible_walking_clues,0);
  assert.ok(b.withheld.every(x=>x.reason==="index_only_advertisement"));
 }
});
test("pasted original ad lines accept exact named official POIs and disclosed station only",()=>{
 const original=[
  "ひばりが丘公園・・・約230ｍ（徒歩3分）",
  "西東京市立中原小学校・・・約880ｍ（徒歩11分）",
  "ひばりヶ丘駅徒歩5分",
  "スーパーまで徒歩2分"
 ].join("\n");
 const r=bridgePastedPublicText(original,pois());
 assert.equal(r.eligible_walking_clues,3);
 assert.equal(r.withheld_clues,1);
 assert.equal(r.conditions[2].place_id,"station:seibu-hibarigaoka");
 assert.equal(r.conditions[0].claimed_approx_m,230);
 assert.equal(r.source.source_quality,"user_pasted_unverified");
 assert.ok(r.withheld[0].reason==="no_exact_public_place_name");
});
test("unknown metric does not infer walking from distance and inconsistent text remains quarantined",()=>{
 const r=bridgePastedPublicText("谷戸イチョウ公園（現地より約590m）\nひばりが丘PARCO：約1537m（徒歩15分）",pois());
 assert.equal(r.eligible_walking_clues,0);
 assert.deepEqual(r.withheld.map(x=>x.reason),["walk_minute_not_explicit","distance_and_minutes_inconsistent"]);
});
test("strict physical name matching collapses PARCO aliases and detects contradictory same-POI clues",()=>{
 const t=bridgePastedPublicText("ひばりが丘PARCO：徒歩3分\nPARCOひばりが丘：徒歩4分",pois());
 assert.equal(t.duplicate_physical_groups,1);
 assert.equal(t.ambiguous_walk_groups,1);
 const compared=compareBridgeAgainstPublicCandidates(t,buildings());
 assert.equal(compared.comparison.ambiguous_groups_withheld,1);
 assert.equal(compared.comparison.ranking_state,"abstain");
});
test("valid P1 JSON without pasted raw source cannot become externally verified public POI condition",()=>{
 const sample=file("synthetic_listing_v0.2.json");
 const r=bridgeReviewedJson(JSON.stringify(sample),"",pois());
 assert.equal(r.conditions.length,0);
 assert.ok(r.withheld.length>=3);
});
test("P1 validated JSON + matching public excerpt is converted to P2 without using property fields",()=>{
 const sample=file("synthetic_listing_v0.2.json");
 const text="ひばりが丘PARCO 徒歩3分";
 sample.listing.stations=[];
 sample.listing.nearby=[{name:"ひばりが丘PARCO",kind:"named_place",category:"shopping",
  walk_minutes:3,qualifier:"exact_advertised"}];
 sample.evidence=[{field_path:"listing.nearby[0].walk_minutes",
  source_id:"demo-fictional-source",kind:"explicit",verbatim_excerpt:text,
  dependency_group:"advertisement-1"}];
 sample.listing.property_type="公開済み建物ではない";
 sample.listing.location_hint="住所が流入してはいけない";
 const r=bridgeReviewedJson(JSON.stringify(sample),text,pois());
 assert.equal(r.eligible_walking_clues,1);
 const x=compareBridgeAgainstPublicCandidates(r,buildings());
 assert.equal(x.candidate_count,7);
 assert.equal(x.conditions_passed,1);
 assert.equal(x.comparison.ranking_state,"abstain");
 assert.equal(x.observed_route_count,0);
 assert.equal(x.independent_accuracy,null);
 assert.ok(x.comparison.ranked.every(v=>v.summary.unknown===1));
 const str=JSON.stringify(x.scenario);
 assert.ok(!str.includes("住所が流入してはいけない"));
 assert.ok(!str.includes("C48269648"));
 assert.ok(!str.includes("ひばりヶ丘プラザ"));
 assert.ok(!str.includes("mansion/"));
});
test("broken P1 excerpt fails validation and cannot be silently bridged",()=>{
 const sample=file("synthetic_listing_v0.2.json");
 assert.throws(()=>bridgeReviewedJson(JSON.stringify(sample),"本文に引用なし",pois()),/validation failed/);
});
test("frozen source / candidate ledgers remain untouched and answer-key separation holds",()=>{
 const pre=ads(),poi=pois(),b=buildings(),snap=[pre,poi,b].map(JSON.stringify);
 const r=bridgePrelockedPublicAd(pre,poi,"H01");
 const x=compareBridgeAgainstPublicCandidates(r,b);
 assert.equal(x.comparison.can_confirm_property,false);
 assert.ok(x.scenario.candidates.every(z=>z.distances.length===0&&z.attributes&&Object.keys(z.attributes).length===0));
 const s=JSON.stringify(x.scenario);
 assert.ok(!s.includes("プレミスト"));
 assert.ok(!s.includes("谷戸町"));
 assert.ok(!s.includes("C48269648"));
 assert.ok(!s.includes("https://"));
 assert.deepEqual([pre,poi,b].map(JSON.stringify),snap);
});
test("unmapped target, missing source and too long payloads fail closed",()=>{
 assert.throws(()=>bridgePrelockedPublicAd(ads(),pois(),"H99"),/Unknown/);
 assert.throws(()=>bridgePastedPublicText("a".repeat(200001),pois()),/size/);
 assert.throws(()=>compareBridgeAgainstPublicCandidates({},buildings()),/Invalid/);
});

test("ambiguous compound POI source line cannot be scored as its first named park",()=>{
 const r=bridgePastedPublicText("ひばりが丘公園からひばりが丘PARCO 徒歩3分",pois());
 assert.equal(r.eligible_walking_clues,0);
 assert.ok(r.withheld.some(x=>x.reason==="multiple_physical_pois_in_line"));
});
test("a nearby but different named station is not mapped to the fixed Hibarigaoka station",()=>{
 const s=file("synthetic_listing_v0.2.json");
 s.listing.stations[0].name="ひばりヶ丘東駅";
 const quote="ひばりヶ丘東駅徒歩7分";
 s.evidence[0].verbatim_excerpt=quote;
 const r=bridgeReviewedJson(JSON.stringify(s),quote,pois());
 assert.equal(r.conditions.length,0);
 assert.ok(r.withheld.some(x=>x.reason==="station_not_in_fixed_public_registry"));
});
