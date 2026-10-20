import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectLockedPublicCohort,predictOnlyIfComplete}
 from "../src/locked_cohort_readiness.mjs";
const load=x=>JSON.parse(readFileSync(new URL("../examples/"+x,import.meta.url),"utf8"));
const lock=()=>load("oshima_five_preregistered_20261020.json");
const partial=()=>load("oshima_five_partial_17routes_20261020.json");

test("cohort preregistered five official estates and four station references",()=>{
 const x=lock();
 assert.equal(x.candidates.length,5);
 assert.equal(x.stations.length,4);
 assert.equal(x.advertisements.length,5);
 assert.equal(x.candidates.reduce((n,c)=>n+c.distances.length,0),0);
});
test("seventeen retrieved routes and three missing must never be scored as accuracy",()=>{
 const audit=inspectLockedPublicCohort(lock(),partial());
 assert.equal(audit.expected_routes,20);
 assert.equal(audit.measured_routes,17);
 assert.equal(audit.missing_routes,3);
 assert.equal(audit.can_grade_primary_cohort,false);
 assert.equal(audit.completion_fraction,0.85);
 assert.equal(audit.identity_verified,false);
 assert.equal(audit.independent_market_accuracy_established,false);
 assert.deepEqual(audit.missing_pairs,[
 {candidate_id:"C03",place_id:"nishi-oshima"},
 {candidate_id:"C03",place_id:"kameido"},
 {candidate_id:"C04",place_id:"higashi-oshima"}]);
});
test("incomplete set refuses public Top1/Top3 evaluation",()=>{
 assert.throws(()=>predictOnlyIfComplete(lock(),partial()),/3 missing/);
});
test("candidate coordinate tampering invalidates pre-registered cohort",()=>{
 const data=partial();data.candidates[0].lon+=0.001;
 assert.throws(()=>inspectLockedPublicCohort(lock(),data),/candidate universe/);
});
test("updating an advertised time interval after routing is rejected",()=>{
 const data=partial();data.advertisements[0].conditions[0].max_minutes=20;
 assert.throws(()=>inspectLockedPublicCohort(lock(),data),/advertisements/);
});
test("dropping a known published candidate is rejected",()=>{
 const data=partial();data.candidates.pop();
 assert.throws(()=>inspectLockedPublicCohort(lock(),data),/candidate universe/);
});
test("cannot change station representative coordinate after route measurements",()=>{
 const data=partial();data.stations[0].lon+=0.004;
 assert.throws(()=>inspectLockedPublicCohort(lock(),data),/station references changed/);
});
test("missing routes never replaced by implied zero",()=>{
 const audit=inspectLockedPublicCohort(lock(),partial());
 assert.ok(audit.missing_pairs.every(m=>!partial().candidates.find(c=>c.id===m.candidate_id)
   .distances.some(d=>d.place_id===m.place_id)));
});
test("counterfactual complete data is only valid for a synthetic unit test",()=>{
 const data=partial();
 for(const {candidate_id,place_id} of inspectLockedPublicCohort(lock(),data).missing_pairs){
  data.candidates.find(c=>c.id===candidate_id).distances.push({
   place_id,meters:1200,air_m:800,snap_start_m:8,snap_end_m:4,
   source:"SYNTHETIC_FOR_UNIT_TEST_NOT_OBSERVED"});
 }
 const audit=inspectLockedPublicCohort(lock(),data);
 assert.equal(audit.missing_routes,0);
 assert.equal(audit.can_grade_primary_cohort,true);
 assert.equal(audit.independent_market_accuracy_established,false);
 assert.equal(predictOnlyIfComplete(lock(),data).sample_count,5);
});
test("unknown or duplicate route option fails closed",()=>{
 const d=partial(),value={...d.candidates[0].distances[0]};
 d.candidates[0].distances.push(value);
 assert.throws(()=>inspectLockedPublicCohort(lock(),d),/Invalid measured route/);
});
