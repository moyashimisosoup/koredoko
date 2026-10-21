import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeHibariReferenceWalkPilot} from "../src/hibari_v2_reference_pilot.mjs";
import {buildHibariRouteCoverage} from "../src/hibari_reference_point_plan.mjs";
const load=x=>JSON.parse(readFileSync(new URL("../examples/"+x,import.meta.url),"utf8"));
const pilots=()=>load("hibari_v2_exploratory_walks_20261022.json");
const refs=()=>load("hibari_geolonia_v2_address_number_20261022.json");
const plan=()=>buildHibariRouteCoverage(
 load("hibari_real_ads_prelocked_20261021.json"),
 load("hibari_poi_identities_20261021.json"),
 load("hibari_public_building_addresses_20261021.json"));
const go=()=>summarizeHibariReferenceWalkPilot(pilots(),refs(),plan());
test("exactly two externally returned public pedestrian walks are exploratory, not scoring",()=>{
 const x=go();
 assert.equal(x.planned_pairs,42);
 assert.equal(x.exploratory_observed_pairs,2);
 assert.equal(x.remaining_unprobed_pairs,40);
 assert.equal(x.quality_qualified_routes,0);
 assert.equal(x.scoring_eligible_routes,0);
 assert.equal(x.independent_accuracy,null);
 assert.deepEqual(x.evidence.map(r=>r.reported_distance_m),[298,335]);
});
test("replayed reference coordinates and public route GET requests are consistent",()=>{
 const x=go();
 assert.deepEqual(x.evidence.map(r=>r.candidate_id),["K03","K05"]);
 assert.ok(x.evidence.every(r=>r.endpoint_snap_m===null&&r.scoring_eligible===false&&r.observed));
});
test("tampering with endpoint position, route length, quality flag, or source URL fails",()=>{
 for(const change of [
  p=>{p.observations[0].meters=300;},
  p=>{p.observations[0].origin_point.lat=35.98;},
  p=>{p.observations[1].endpoint_snap_end_m=0;},
  p=>{p.observations[0].scoring_eligible=true;},
  p=>{p.observations[0].request_url="https://example.org/route";},
  p=>{p.observations[0].candidate_id="NOT_PUBLIC";},
  p=>{p.observations.push({...p.observations[0]});}
 ]){
  const p=pilots();change(p);
  assert.throws(()=>summarizeHibariReferenceWalkPilot(p,refs(),plan()));
 }
});
test("source version, distance and scoring flags are not silently changed by audit",()=>{
 const p=pilots(),j=JSON.stringify(p);
 summarizeHibariReferenceWalkPilot(p,refs(),plan());
 assert.equal(JSON.stringify(p),j);
});