import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bridgePrelockedPublicAd,bridgePastedPublicText} from "../src/ad_input_bridge.mjs";
import {buildHibariSameRegionMapReview} from "../src/hibari_same_region_map_view.mjs";
const file=x=>JSON.parse(readFileSync(new URL("../examples/"+x,import.meta.url),"utf8"));
const ads=()=>file("hibari_real_ads_prelocked_20261021.json");
const poi=()=>file("hibari_poi_identities_20261021.json");
const buildings=()=>file("hibari_public_building_addresses_20261021.json");
const refs=()=>file("hibari_geolonia_v2_address_number_20261022.json");
const towns=()=>file("hibari_geolonia_town_chome_references_20261022.json");
const go=(id="H01")=>buildHibariSameRegionMapReview(
  bridgePrelockedPublicAd(ads(),poi(),id),refs(),buildings(),poi(),towns());
test("maps exactly 13 real address-number public reference points out of 18 in SAME Hibarigaoka cohort",()=>{
 const x=go();
 assert.equal(x.cohort_id,"hibarigaoka-20261021");
 assert.equal(x.target_reference_count,18);
 assert.equal(x.coordinate_reference_count,13);
 assert.equal(x.map_points.filter(p=>p.type==="public_complex_reference").length,7);
 assert.equal(x.map_points.filter(p=>p.type==="station_reference").length,1);
 assert.equal(x.map_points.filter(p=>p.type==="facility_reference").length,10);
 assert.equal(x.missing_target_references.length,5);
 assert.equal(x.physical_pois_on_map,6);
 assert.ok(x.map_points.every(p=>p.xPct>=0&&p.xPct<=100&&p.yPct>=0&&p.yPct<=100));
 assert.equal(x.map_points.length,18);
 assert.equal(x.lower_precision_town_reference_count,5);
 assert.equal(x.map_points.find(p=>p.id==="K01").point_precision,"town_chome_reference_only");
});
test("same region H01 has two real facility quotes, but park has no address-number point",()=>{
 const x=go("H01");
 assert.equal(x.origin_advertisement_id,"H01");
 assert.equal(x.input_quality,"direct_page_excerpt");
 assert.equal(x.conditions.length,2);
 const park=x.conditions.find(c=>c.place_id==="nishitokyo:hibarigaoka-park");
 const school=x.conditions.find(c=>c.place_id==="nishitokyo:nakahara-elementary");
 assert.equal(park.reference_status,"town_chome_reference_only");
 assert.equal(school.reference_status,"address_number_reference_only");
 assert.ok(park.source_quote.includes("約230"));
 assert.equal(x.withheld_condition_count,1);
 assert.equal(x.scoring_eligible_pairs,0);
 assert.equal(x.ranking_state,"abstain");
 assert.equal(x.candidate_ids_not_excluded.length,7);
 assert.equal(x.independent_accuracy,null);
});
test("H02 H03 show two public-number location references each without transferring ad-building answers",()=>{
 for(const adId of ["H02","H03"]){
  const x=go(adId);
  assert.equal(x.conditions.length,2);
  assert.ok(x.conditions.every(c=>c.reference_status==="address_number_reference_only"));
  assert.equal(x.withheld_condition_count,2);
  assert.ok(x.conditions.every(c=>c.observed_walking_m===null&&!c.scoring_eligible));
  assert.ok(x.candidates.every(c=>c.walk_route_scoring_eligible===false));
  const output=JSON.stringify(x);
  assert.ok(!output.includes("ひばりヶ丘プラザ"));
  assert.ok(!output.includes("グランフォーレひばりが丘"));
  assert.ok(!output.includes("谷戸町3丁目27番24号"));
 }
});
test("index-only H04-H07 remain withheld, without public proof being promoted by map reference",()=>{
 for(const id of ["H04","H05","H06","H07"]){
  const x=go(id);
  assert.equal(x.input_condition_count,0);
  assert.equal(x.ranking_state,"abstain");
  assert.ok(x.withheld_conditions.length>=3);
  assert.equal(x.recorded_pedestrian_comparison_pairs,0);
 }
});
test("explicit pasted public paragraph may be mapped but no route/ranking added",()=>{
 const raw="ひばりが丘PARCO：徒歩3分\nひばりヶ丘駅徒歩5分";
 const b=bridgePastedPublicText(raw,poi());
 const x=buildHibariSameRegionMapReview(b,refs(),buildings(),poi(),towns());
 assert.equal(x.conditions.length,2);
 assert.equal(x.origin_advertisement_id,null);
 assert.equal(x.conditions.find(c=>c.place_id==="station:seibu-hibarigaoka").reference_status,"address_number_reference_only");
 assert.equal(x.recorded_pedestrian_comparison_pairs,0);
 assert.equal(x.scoring_eligible_pairs,0);
 assert.equal(x.ranking_state,"abstain");
});
test("missing K01 residential reference cannot be invented from town or neighboring points",()=>{
 const x=go();
 const missing=x.missing_target_references.find(p=>p.id==="K01");
 assert.equal(missing.reason,"exact_number_absent");
 const candidate=x.candidates.find(p=>p.id==="K01");
 assert.equal(candidate.map_point_id,"K01");
 assert.equal(candidate.public_reference_visible,true);
 assert.ok(x.candidates.every(p=>p.comparison_status==="exploratory_order_only"));
 assert.ok(x.candidates.every(p=>p.walk_route_scoring_eligible===false));
});
test("reject cross-region or tampered geography and preserve all source input documents",()=>{
 const a=ads(),b=buildings(),c=poi(),d=refs();const backup=[a,b,c,d].map(JSON.stringify);
 const bridge=bridgePrelockedPublicAd(a,c,"H01");
 const x=buildHibariSameRegionMapReview(bridge,d,b,c,towns());
 assert.equal(x.ground_truth_attached,false);
 assert.deepEqual([a,b,c,d].map(JSON.stringify),backup);
 const other={...d,cohort_id:"oshima-20261020"};
 assert.throws(()=>buildHibariSameRegionMapReview(bridge,other,b,c,towns()),/mixed-region/);
 const malicious={...d,references:d.references.map(p=>p.target_id==="building:K02"?
   {...p,point:{...p.point,latitude:35.9}}:p)};
 assert.throws(()=>buildHibariSameRegionMapReview(bridge,malicious,b,c,towns()));
 const tampered={...bridge,conditions:[...bridge.conditions,{id:"x",kind:"walk",place_id:"unknown"}]};
 assert.throws(()=>buildHibariSameRegionMapReview(tampered,d,b,c,towns()));
});

test("practical exploration keeps every public candidate even when 5 references have only town points",()=>{
 const x=go("H02");
 assert.equal(x.exploratory_order.retained_candidates,7);
 assert.equal(x.exploratory_order.excluded_candidates,0);
 assert.equal(x.exploratory_order.used_model_for_candidates,7);
 assert.ok(x.candidates.every(p=>Number.isInteger(p.exploratory_order)));
 assert.ok(x.candidates.every(p=>p.scenario_worst_rank>=p.scenario_best_rank));
 assert.ok(x.candidates.some(p=>p.reference_quality==="town_chome_reference_only"));
 assert.equal(x.ranking_state,"abstain"); // strict evidence gate unchanged
 assert.equal(x.user_facing_candidate_state,"preliminary_comparison_not_exclusion");
});
test("without any verified advertisement clue the map stays usable, but the provisional order is absent",()=>{
 const x=go("H04");
 assert.ok(x.candidates.every(p=>p.exploratory_order===null));
 assert.equal(x.user_facing_candidate_state,"all_candidates_retained_no_valid_ad_clues");
 assert.equal(x.exploratory_order.excluded_candidates,0);
});
