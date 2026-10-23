import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const g=()=>JSON.parse(readFileSync(new URL("../examples/hibari_station_public_exit_gate_20261022.json",import.meta.url),"utf8"));
test("official station source confirms exit-side names, not surveyed exit coordinates",()=>{
 const a=g();
 assert.deepEqual(a.public_station.official_public_exit_sides,["北口","南口"]);
 assert.ok(a.public_station.official_renewal_url.includes("seiburailway.jp"));
 assert.equal(a.public_station.public_exit_coordinates,null);
 assert.equal(a.public_station.gate_coordinates,null);
 assert.equal(a.public_station.valid_station_exit_for_routing,false);
 assert.equal(a.public_station.station_exit_choice,"unresolved");
});
test("pilot public named estates remain distinct from private apartments and unsurveyed gate data",()=>{
 const a=g();
 assert.deepEqual(a.building_access_review.map(x=>x.candidate_id),["K03","K05"]);
 assert.ok(a.building_access_review.every(x=>x.actual_pedestrian_access_point===null&&
  x.access_point_source_status==="no_independent_entrance_coordinate"&&
  x.qualifies_for_rank===false));
 assert.equal(a.policy.formal_route_certification,false);
 assert.equal(a.policy.blind_accuracy_available,false);
});
