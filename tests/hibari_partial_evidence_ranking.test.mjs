import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bridgePrelockedPublicAd} from "../src/ad_input_bridge.mjs";
import {buildHibariSameRegionMapReview} from "../src/hibari_same_region_map_view.mjs";
import {buildHibariExploratoryOrder} from "../src/hibari_partial_evidence_ranking.mjs";
const read=n=>JSON.parse(readFileSync(new URL("../examples/"+n,import.meta.url),"utf8"));
const ads=()=>read("hibari_real_ads_prelocked_20261021.json");
const poi=()=>read("hibari_poi_identities_20261021.json");
const buildings=()=>read("hibari_public_building_addresses_20261021.json");
const address=()=>read("hibari_geolonia_v2_address_number_20261022.json");
const town=()=>read("hibari_geolonia_town_chome_references_20261022.json");
const run=(id="H02",factor=1.3)=>buildHibariSameRegionMapReview(
 bridgePrelockedPublicAd(ads(),poi(),id),address(),buildings(),poi(),town(),{focusFactor:factor});
test("7 candidates remain and all 18 public locations are shown at declared source precision",()=>{
 const x=run();
 assert.equal(x.coordinate_reference_count,13);
 assert.equal(x.lower_precision_town_reference_count,5);
 assert.equal(x.map_points.length,18);
 assert.equal(x.available_public_buildings,7);
 assert.equal(x.exploratory_order.retained_candidates,7);
 assert.equal(x.exploratory_order.excluded_candidates,0);
 assert.equal(x.candidate_ids_not_excluded.length,7);
 assert.equal(x.map_points.find(p=>p.id==="K01").point_precision,"town_chome_reference_only");
 assert.equal(x.recorded_pedestrian_comparison_pairs,0);
 assert.equal(x.scoring_eligible_pairs,0);
 assert.equal(x.independent_accuracy,null);
});
test("all H01/2/3 source-excerpt clues generate useful what-if order, but strict pedestrian ranking stays abstained",()=>{
 for(const id of ["H01","H02","H03"]){
  const x=run(id);
  assert.equal(x.input_condition_count,2);
  assert.equal(x.exploratory_order.used_model_for_candidates,7);
  assert.ok(x.exploratory_order.candidates.every(p=>Number.isInteger(p.reference_order)));
  assert.ok(x.exploratory_order.candidates.every(p=>p.available_clues>0&&p.excluded===false));
  assert.equal(x.ranking_state,"abstain");
  assert.equal(x.user_facing_candidate_state,"preliminary_comparison_not_exclusion");
  assert.ok(!JSON.stringify(x.exploratory_order).includes("ひばりヶ丘プラザ"));
 }
});
test("changing detour assumption changes model inputs but never deletes any candidate or implies accuracy",()=>{
 const first=run("H02",1),last=run("H02",1.6);
 assert.deepEqual(first.exploratory_order.candidates.map(c=>c.candidate_id).sort(),
  last.exploratory_order.candidates.map(c=>c.candidate_id).sort());
 assert.equal(first.exploratory_order.focus_factor,1);
 assert.equal(last.exploratory_order.focus_factor,1.6);
 assert.equal(first.exploratory_order.independent_accuracy,null);
 assert.equal(last.exploratory_order.numbers_are_probabilities,false);
 assert.ok(first.exploratory_order.candidates.some(x=>x.scenario_best_rank!==null));
});
test("missing condition is neutral even when other valid clues exist",()=>{
 const conditions=[
  {place_id:"nishitokyo:hibarigaoka-parco",advertised_walk_minutes:3,claimed_approx_m:236},
  {place_id:"nishitokyo:yato-icho-park",advertised_walk_minutes:6,claimed_approx_m:480}
 ];
 const candidates=Array.from({length:7},(_,i)=>({id:"K0"+(i+1)}));
 const locations=[...candidates.map((c,i)=>({id:c.id,coordinates:{lat:35.748+i*.0001,lon:139.54},quality:"address_number_reference_only"})),
 {id:"facility:nishitokyo:hibarigaoka-parco",coordinates:{lat:35.751,lon:139.543},quality:"address_number_reference_only"}];
 const x=buildHibariExploratoryOrder(conditions,candidates,locations);
 assert.ok(x.candidates.every(c=>c.available_clues===1&&c.advertised_clue_count===2));
 assert.ok(x.candidates.every(c=>c.quality_counts.uncomputable_clues===1&&c.excluded===false));
 assert.ok(x.candidates.every(c=>c.evidence[1].status==="reference_or_quote_missing"));
});
test("zero usable references produces no rank but all 7 candidates retained, never a false perfect score",()=>{
 const x=buildHibariExploratoryOrder([{place_id:"some:unknown",advertised_walk_minutes:3}],
  Array.from({length:7},(_,i)=>({id:"K0"+(i+1)})),[]);
 assert.equal(x.no_geographic_information_candidates.length,7);
 assert.ok(x.candidates.every(c=>c.reference_order===null&&c.scenario_scores["1.3"]===null));
 assert.ok(x.candidates.every(c=>c.excluded===false));
});
test("non-calibrated distances are not mislabeled as measured, weights or rank scores are not probabilities",()=>{
 const x=run("H01");
 assert.equal(x.exploratory_order.assumed_town_reference_weight,0.25);
 assert.equal(x.exploratory_order.confidence_level,null);
 assert.equal(x.exploratory_order.numbers_are_probabilities,false);
 assert.ok(x.exploratory_order.candidates.every(c=>c.observed_validated_routes===0));
 assert.ok(x.exploratory_order.candidates.flatMap(c=>c.evidence).every(e=>e.observed_pedestrian_route_m===null));
 assert.ok(x.conditions.some(c=>c.reference_status==="town_chome_reference_only"));
 assert.ok(x.exploratory_order.candidates.some(c=>c.quality_counts.town_level_clues>0));
});
test("invalid detour and cross-region references are rejected",()=>{
 assert.throws(()=>run("H02",9),/Unexpected exploratory comparison input/);
 const original=town();original.records[0].lat=35.98;
 const x=bridgePrelockedPublicAd(ads(),poi(),"H02");
 assert.throws(()=>buildHibariSameRegionMapReview(x,address(),buildings(),poi(),original));
});
