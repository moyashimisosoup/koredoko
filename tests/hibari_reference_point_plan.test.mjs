import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildHibariGeocodeManifest,interpretGsiAddressFeatures,buildHibariRouteCoverage}
 from "../src/hibari_reference_point_plan.mjs";
const file=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const a=()=>file("hibari_real_ads_prelocked_20261021.json");
const p=()=>file("hibari_poi_identities_20261021.json");
const b=()=>file("hibari_public_building_addresses_20261021.json");
test("seven published named building reference addresses and one station all have citation URLs",()=>{
 const x=b();assert.equal(x.buildings.length,7);
 assert.deepEqual(x.buildings.map(y=>y.candidate_id),["K01","K02","K03","K04","K05","K06","K07"]);
 assert.ok(x.buildings.every(y=>y.public_building_address.startsWith("東京都西東京市")&&
    y.source_url.startsWith("https://")&&y.coordinate===null&&y.entrance_status==="unverified"));
 assert.ok(x.station.source_url.includes("seiburailway.jp"));
});
test("directly checked ads produce 13 GSI requests, no observed coordinate or route",()=>{
 const m=buildHibariGeocodeManifest(b(),p());
 assert.equal(m.requests.length,13); // 7 buildings + 1 station + 5 direct-ad public POIs
 assert.equal(m.requests.filter(x=>x.kind==="public_facility_address").length,5);
 assert.ok(m.requests.every(x=>x.coordinate===null&&x.point_status==="not_requested"&&
    x.access_point_verified===false&&x.gsi_url.startsWith("https://msearch.gsi.go.jp/address-search/AddressSearch?q=")));
});
test("all registry facilities expand to 18 reference requests without changing station/candidate universe",()=>{
 const m=buildHibariGeocodeManifest(b(),p(),{directOnly:false});
 assert.equal(m.requests.length,18);
 assert.equal(m.requests.filter(x=>x.kind==="public_building_address").length,7);
});
test("GSI reference search permits ambiguous block results only as manual-review points",()=>{
 const r=buildHibariGeocodeManifest(b(),p()).requests[0];
 const ans=interpretGsiAddressFeatures(r,[{type:"Feature",geometry:{coordinates:[139.54,35.75]},
 properties:{title:"東京都西東京市ひばりが丘三丁目２番"}}]);
 assert.equal(ans.candidates.length,1);
 assert.equal(ans.candidates[0].coordinate_kind,"GSI_address_search_block_reference_not_entrance");
 assert.equal(ans.status,"candidate_points_need_manual_review");
 assert.equal(ans.access_point_verified,false);
 assert.equal(ans.route_input_ready,false);
});
test("invalid coordinates or different municipality are not mistaken for reviewed reference points",()=>{
 const r=buildHibariGeocodeManifest(b(),p()).requests[0];
 const resp=[{geometry:{coordinates:[1,2]},properties:{title:"東京都西東京市ひばりが丘"}},
  {geometry:{coordinates:[139.56,35.75]},properties:{title:"東京都練馬区"}}];
 assert.equal(interpretGsiAddressFeatures(r,resp).candidates.length,0);
 assert.equal(interpretGsiAddressFeatures(r,null).status,"invalid_response");
});
test("GSI response in the wrong block is rejected, even within the same city and neighborhood",()=>{
 const r=buildHibariGeocodeManifest(b(),p()).requests[0];
 const wrong=[{geometry:{coordinates:[139.54,35.75]},properties:{title:"東京都西東京市ひばりが丘三丁目３番"}}];
 const x=interpretGsiAddressFeatures(r,wrong);
 assert.equal(x.status,"no_matching_street_block");
 assert.equal(x.candidates.length,0);
 assert.equal(x.geocoded,false);
});
test("multiple exact-block GSI results remain ambiguous and never routable",()=>{
 const r=buildHibariGeocodeManifest(b(),p()).requests[0];
 const exact={geometry:{coordinates:[139.54,35.75]},properties:{title:"東京都西東京市ひばりが丘三丁目２番"}};
 const x=interpretGsiAddressFeatures(r,[exact,exact]);
 assert.equal(x.status,"multiple_block_references_review_needed");
 assert.equal(x.candidates.length,2);
 assert.equal(x.route_input_ready,false);
});
test("first cohort routing plan has exactly 42 separate station and facility combinations but no measured distances",()=>{
 const c=buildHibariRouteCoverage(a(),p(),b());
 assert.equal(c.expected_route_pairs,42);
 assert.equal(c.destination_count,6); // one station plus five distinct physical POIs
 assert.equal(c.candidate_count,7);
 assert.equal(c.observed_route_pairs,0);
 assert.equal(c.scoring_ready,false);
 assert.equal(c.access_points_verified,false);
 assert.ok(c.routes.every(r=>r.meters===null&&r.observed===false&&r.eligible_for_scoring===false));
});
test("full cohort plan has 70 route pairs only after retaining the original 7 ad sources",()=>{
 const c=buildHibariRouteCoverage(a(),p(),b(),{directOnly:false});
 assert.equal(c.expected_route_pairs,70);
 assert.equal(c.destination_count,10); // station + 9 POIs from unquarantined clues
 assert.equal(new Set(c.routes.map(x=>x.candidate_id+"|"+x.destination_key)).size,70);
});
test("public answer location evidence never silently overwrites source advertisement walking times",()=>{
 const ads=a(),plan=buildHibariRouteCoverage(ads,p(),b());
 assert.deepEqual(ads.advertisements.map(x=>x.station.walk_minutes),[5,4,2,11,18,10,18]);
 assert.ok(!JSON.stringify(plan).includes("ひばりヶ丘プラザ"));
 assert.ok(!plan.routes.some(x=>x.candidate_id.startsWith("H")));
 assert.ok(!JSON.stringify(plan).includes("谷戸町3丁目27番24号"));
 assert.ok(plan.routes.every(x=>!("correct_advertisement_id" in x)));
});
