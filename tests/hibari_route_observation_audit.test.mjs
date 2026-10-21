import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildHibariRouteCoverage} from "../src/hibari_reference_point_plan.mjs";
import {auditHibariRouteObservations} from "../src/hibari_route_observation_audit.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const plan=()=>buildHibariRouteCoverage(
 read("hibari_real_ads_prelocked_20261021.json"),
 read("hibari_poi_identities_20261021.json"),
 read("hibari_public_building_addresses_20261021.json"));
const synthetic=(pair)=>({
 candidate_id:pair.candidate_id,destination_key:pair.destination_key,
 travel_mode:"pedestrian",meters:420,snap_start_m:4,snap_end_m:6,
 record_class:"synthetic_test_only",engine:"synthetic_only",
 route_dataset_revision:"unit-test-not-a-graph",
 route_source_url:"https://example.org/SYNTHETIC_NOT_OBSERVED",
 observed_at:"2026-10-21T15:00:00+09:00",
 origin_point_kind:"MLIT_ISJ_block_representative",
 destination_point_kind:"MLIT_ISJ_block_representative",
 origin_point_source_url:"https://nlftp.mlit.go.jp/isj/",
 destination_point_source_url:"https://nlftp.mlit.go.jp/isj/",
 origin_entrance_verified:false,destination_entrance_verified:false
});
test("direct-ad first-cohort contains 42 unknown routes, no manufactured metric",()=>{
 const p=plan(),a=auditHibariRouteObservations(p,[]);
 assert.equal(a.planned_route_pairs,42);
 assert.equal(a.missing_route_pairs,42);
 assert.equal(a.measured_route_pairs,0);
 assert.equal(a.potentially_scoring_eligible_pairs,0);
 assert.equal(a.ready_for_blind_accuracy,false);
 assert.equal(a.independent_accuracy,null);
 assert.ok(a.rows.every(x=>x.meters===null&&!x.observed));
});
test("synthetic unit-test routes can exercise audit UI but cannot change measurement count",()=>{
 const p=plan(),a=auditHibariRouteObservations(p,[synthetic(p.routes[0])]);
 assert.equal(a.synthetic_test_pairs,1);
 assert.equal(a.measured_route_pairs,0);
 assert.equal(a.missing_route_pairs,41);
 assert.equal(a.rows[0].meters,420);
 assert.equal(a.rows[0].status,"synthetic_test_only");
 assert.equal(a.rows[0].eligible_for_scoring,false);
});
test("documented example-shaped public reference route is measured but cannot score entrance identity",()=>{
 const p=plan(),o=synthetic(p.routes[1]);
 Object.assign(o,{record_class:"measured_public_route",engine:"Valhalla",
 route_dataset_revision:"test-mock-unpinned-graph",
 route_source_url:"https://valhalla1.openstreetmap.de/route"});
 const a=auditHibariRouteObservations(p,[o]);
 assert.equal(a.measured_route_pairs,1);
 assert.equal(a.entrance_review_needed_pairs,1);
 assert.equal(a.potentially_scoring_eligible_pairs,0);
 assert.equal(a.rows[1].status,"observed_reference_route_not_entrance");
 assert.equal(a.ready_for_blind_accuracy,false);
});
test("large endpoint snaps remain review-needed even with independently documented entry points",()=>{
 const p=plan(),o=synthetic(p.routes[2]);
 Object.assign(o,{record_class:"measured_public_route",engine:"Valhalla",
 route_dataset_revision:"test-mock-unpinned-graph",route_source_url:"https://valhalla1.openstreetmap.de/route",
 origin_point_kind:"audited_public_building_access",destination_point_kind:"audited_public_station_access",
 origin_entrance_verified:true,destination_entrance_verified:true,
 snap_end_m:89});
 const a=auditHibariRouteObservations(p,[o]);
 assert.equal(a.rows[2].status,"observed_reference_route_needs_review");
 assert.equal(a.rows[2].eligible_for_scoring,false);
 assert.ok(a.rows[2].quality_flags.includes("endpoint_snap_review"));
});
test("even apparently qualified measured route cannot create independent-accuracy metric",()=>{
 const p=plan(),o=synthetic(p.routes[0]);
 Object.assign(o,{record_class:"measured_public_route",engine:"Valhalla",
 route_dataset_revision:"test-mock-unpinned-graph",route_source_url:"https://valhalla1.openstreetmap.de/route",
 origin_point_kind:"audited_public_building_access",destination_point_kind:"audited_public_school_access",
 origin_entrance_verified:true,destination_entrance_verified:true});
 const a=auditHibariRouteObservations(p,[o]);
 assert.equal(a.potentially_scoring_eligible_pairs,1);
 assert.equal(a.ready_for_blind_accuracy,false);
 assert.equal(a.independent_accuracy,null);
 assert.equal(a.rows[0].confirmed_identity,false);
});
test("mismatching building-destination pair, duplication, and fabricated route source all rejected",()=>{
 const p=plan(),o=synthetic(p.routes[0]);
 assert.throws(()=>auditHibariRouteObservations(p,[{...o,candidate_id:"UNLISTED"}]),/Invalid route evidence/);
 assert.throws(()=>auditHibariRouteObservations(p,[o,o]),/Duplicate observed route pair/);
 assert.throws(()=>auditHibariRouteObservations(p,[{...o,record_class:"measured_public_route"}]),/Placeholder URL/);
});
test("reference point cannot self-certify as a surveyed entrance",()=>{
 const p=plan(),o=synthetic(p.routes[0]);
 assert.throws(()=>auditHibariRouteObservations(p,[{...o,origin_entrance_verified:true}]),/Reference point/);
});
test("source URL, timestamp and network snap distance are mandatory",()=>{
 const p=plan(),o=synthetic(p.routes[0]);
 for(const field of ["route_source_url","origin_point_source_url","destination_point_source_url","observed_at"]){
  const bad={...o,[field]:null};assert.throws(()=>auditHibariRouteObservations(p,[bad]),/Invalid route evidence/);
 }
 assert.throws(()=>auditHibariRouteObservations(p,[{...o,snap_start_m:NaN}]),/Invalid route evidence/);
 assert.throws(()=>auditHibariRouteObservations(p,[{...o,travel_mode:"driving"}]),/Invalid route evidence/);
});
test("cannot modify frozen route planned universe via observations",()=>{
 const p=plan(),original=JSON.stringify(p),o=synthetic(p.routes[0]);
 auditHibariRouteObservations(p,[o]);
 assert.equal(JSON.stringify(p),original);
});
