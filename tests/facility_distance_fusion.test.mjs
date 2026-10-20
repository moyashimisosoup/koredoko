import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {haversineMeters,validateFacilityRegistry,combineFacilityConstraints,evaluatePublishedLocationFusion} from "../src/facility_distance_fusion.mjs";
import {comparePublicCandidates} from "../src/public_building_rank.mjs";
import {inspectLockedPublicCohort,predictOnlyIfComplete} from "../src/locked_cohort_readiness.mjs";
const load=s=>JSON.parse(readFileSync(new URL("../examples/"+s,import.meta.url),"utf8"));
const data=()=>load("oshima_five_complete_20routes_20261020.json");
const registry=()=>load("oshima_public_facilities_20261020.json");
const prereg=()=>load("oshima_five_preregistered_20261020.json");
const frozen=()=>load("oshima_five_frozen_predictions_20261020.json");
const truth=()=>load("oshima_five_answer_revealed_20261020.json");
const clone=x=>JSON.parse(JSON.stringify(x));
const facility=(id,max,metric="straight_m",min=0)=>({facility_id:id,min_m:min,max_m:max,metric});

test("twenty actually measured routes complete unchanged five-estate registration",()=>{
 const o=inspectLockedPublicCohort(prereg(),data());
 assert.equal(o.expected_routes,20);assert.equal(o.measured_routes,20);
 assert.equal(o.missing_routes,0);assert.equal(o.can_grade_primary_cohort,true);
 assert.equal(o.locked_conditions_unchanged,true);
});
test("frozen walking-only rankings match the unchanged actual baseline",()=>{
 const p=predictOnlyIfComplete(prereg(),data()),snapshot=frozen();
 assert.deepEqual(p.cases.map(x=>x.ranked_candidate_ids),snapshot.cases.map(x=>x.ranked_candidate_ids));
 assert.deepEqual(p.cases.map(x=>x.ranked_gap_m),snapshot.cases.map(x=>x.ranked_gap_m));
});
test("answer key committed separately after route-only prediction, 4/5 Top1 and 5/5 Top3",()=>{
 const key=truth(),p=frozen();
 assert.equal(key.frozen_prediction_file,"examples/oshima_five_frozen_predictions_20261020.json");
 assert.equal(p.answer_key_in_prediction,false);
 const grades=key.answers.map(a=>p.cases.find(x=>x.advertisement_id===a.advertisement_id).ranked_candidate_ids.indexOf(a.correct_candidate_id)+1);
 assert.deepEqual(grades,[1,2,1,1,1]);
 assert.equal(grades.filter(x=>x===1).length,4);
 assert.equal(grades.filter(x=>x<=3).length,5);
});
test("registry has three public named civic/school/park POIs with provenance",()=>{
 const r=registry();
 assert.doesNotThrow(()=>validateFacilityRegistry(r));
 assert.deepEqual(r.facilities.map(x=>x.category),["civic","school","park"]);
 assert.ok(r.facilities.every(x=>x.source_url.startsWith("https://")));
});
test("haversine gives zero for identical coordinates, actual representative offsets",()=>{
 const a={lat:35.687229,lon:139.829117};
 assert.equal(haversineMeters(a,a),0);
 const school=registry().facilities[1];
 assert.ok(Math.abs(haversineMeters(a,school)-239)<=2);
});
test("station-only mode exactly reproduces frozen old scoring for five public ads",()=>{
 const d=data(),r=registry();
 for(const ad of d.advertisements){
 const existing=comparePublicCandidates(d,ad.id);
 const fusion=evaluatePublishedLocationFusion(d,r,ad.id);
 assert.deepEqual(fusion.ranked.map(x=>x.candidate_id),existing.ranked.map(x=>x.candidate_id));
 assert.deepEqual(fusion.ranked.map(x=>x.observed_gap_total_m),existing.ranked.map(x=>x.total_absolute_gap_m));
 assert.ok(fusion.ranked.every(x=>x.missing_conditions===0));
 assert.equal(fusion.confirmed_identity,false);
 }
});
test("civic reference distance up to 500m narrows to public Oshima 4chome alone",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
 includeStations:false,facilityConditions:[facility("koto-civic-center",500)]});
 assert.deepEqual(o.reference_compatible_candidates,["C05"]);
 assert.equal(o.narrowing_steps[0].remaining_reference_compatible,1);
 assert.equal(o.ranked[0].candidate_id,"C05");
});
test("school reference within 400m also favors published Oshima 4chome alone",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
 includeStations:false,facilityConditions:[facility("oshima-nanou-school",400)]});
 assert.deepEqual(o.reference_compatible_candidates,["C05"]);
});
test("park straight-line up to 500m retains C01 only at uncalibrated margin",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH01",{
 includeStations:false,facilityConditions:[facility("oshima-komatsugawa-park",500)]});
 assert.deepEqual(o.reference_compatible_candidates,["C01"]);
 assert.ok(o.ranked[0].evidence[0].estimated_range_m[0]<=500);
});
test("station plus facility jointly yields distinct narrowing trace",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
 includeStations:true,facilityConditions:[facility("koto-civic-center",500),facility("oshima-nanou-school",400)]});
 assert.equal(o.independent_physical_clues,4);
 assert.equal(o.narrowing_steps.length,4);
 assert.ok(o.narrowing_steps.every((x,i,a)=>i===0||x.remaining_reference_compatible<=a[i-1].remaining_reference_compatible));
 assert.equal(o.ranked[0].candidate_id,"C05");
 assert.deepEqual(o.reference_compatible_candidates,["C05"]);
});
test("contradictory reference bands yield zero compatible public candidates without asserting location",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
 includeStations:false,facilityConditions:[facility("koto-civic-center",300),facility("oshima-komatsugawa-park",500)]});
 assert.equal(o.reference_compatible_candidates.length,0);
 assert.equal(o.confirmed_identity,false);
});
test("walking route condition for a park without pedestrian observation must remain UNKNOWN",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH01",{
 includeStations:false,facilityConditions:[facility("oshima-komatsugawa-park",1500,"walk_m")]});
 assert.equal(o.fully_observed_across_candidates,false);
 assert.equal(o.ranked.every(x=>x.missing_conditions===1),true);
 assert.equal(o.ranked.every(x=>x.evidence[0].scored===false),true);
 assert.equal(o.reference_compatible_candidates.length,0);
});
test("air distance may flag a walking upper bound as suspect but does not forge a route",()=>{
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH01",{
 includeStations:false,facilityConditions:[facility("koto-civic-center",100,"walk_m")]});
 assert.ok(o.ranked.some(x=>x.evidence[0].status==="air_lower_bound_exceeds_requested_walk_cap"));
 assert.ok(o.ranked.every(x=>x.evidence[0].gap_m===null));
});
test("same physical place under two names is deduplicated and not double scored",()=>{
 const reg=registry();
 const center=reg.facilities[0];
 reg.facilities.push({...center,id:"koto-civic-library-aliased",name:"城東図書館（同じ建物）"});
 const opts=[facility("koto-civic-center",600),facility("koto-civic-library-aliased",400)];
 const d=combineFacilityConstraints(reg,opts);
 assert.equal(d.conditions.length,1);assert.equal(d.duplicate_facility_clues,1);
 assert.deepEqual([d.conditions[0].min_m,d.conditions[0].max_m],[0,600]);
 const result=evaluatePublishedLocationFusion(data(),reg,"OH05",{includeStations:false,facilityConditions:opts});
 assert.equal(result.independent_physical_clues,1);
 assert.equal(result.duplicate_facility_clues,1);
});
test("same physical landmark cannot count both straight and walk as two independent votes",()=>{
 const reg=registry(),c=reg.facilities[0];
 reg.facilities.push({...c,id:"second-name"});
 assert.throws(()=>combineFacilityConstraints(reg,[facility(c.id,500),facility("second-name",500,"walk_m")]),/incompatible distance modes/);
});
test("unknown facility cannot be silently geocoded or included",()=>{
 assert.throws(()=>evaluatePublishedLocationFusion(data(),registry(),"OH01",{facilityConditions:[facility("unknown-home",300)]}),/Invalid distance condition/);
});
test("cannot calculate empty station-and-facility constraints",()=>{
 assert.throws(()=>evaluatePublishedLocationFusion(data(),registry(),"OH01",{includeStations:false}),/Select a station/);
});
test("untrusted typed pedestrian route lacks source and cannot be marked observed",()=>{
 const obs={candidate_id:"C01",facility_id:"koto-civic-center",meters:500,mode:"pedestrian_observed",snap_start_m:0,snap_end_m:0};
 assert.throws(()=>evaluatePublishedLocationFusion(data(),registry(),"OH01",{facilityConditions:[facility("koto-civic-center",600,"walk_m")],facilityRoutes:[obs]}),/Invalid documented/);
});
test("documented walking-route fixtures can be scored but still cannot confirm a building",()=>{
 const route={candidate_id:"C05",facility_id:"koto-civic-center",meters:470,mode:"pedestrian_observed",
 snap_start_m:3,snap_end_m:4,source_url:"https://example.org/SYNTHETIC_UNIT_TEST_NOT_MEASURED"};
 const o=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
 includeStations:false,facilityConditions:[facility("koto-civic-center",500,"walk_m")],facilityRoutes:[route]});
 const c=o.ranked.find(x=>x.candidate_id==="C05");
 assert.equal(c.evidence[0].scored,true);
 assert.equal(c.evidence[0].gap_m,0);
 assert.equal(o.fully_observed_across_candidates,false);
 assert.equal(o.confirmed_identity,false);
});
test("invalid facility geolocation or coordinate uncertainty rejected",()=>{
 const r=registry();r.facilities[0].coordinate_uncertainty_m=-1;
 assert.throws(()=>validateFacilityRegistry(r),/Invalid named/);
});
test("large same-physical alias disagreement gets blocked",()=>{
 const r=registry();r.facilities.push({...r.facilities[0],id:"alias-err",lat:35.9});
 assert.throws(()=>validateFacilityRegistry(r),/Disagreeing aliases/);
});
test("same UR input does not turn reference score into probabilities or confirmed addresses",()=>{
 const x=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
  facilityConditions:[facility("koto-civic-center",500)]});
 assert.equal(x.statistical_accuracy,null);assert.equal(x.can_identify_private_home,false);
 assert.equal(x.ranked.every(r=>r.identity_verified===false&&r.location_probability===null),true);
});
test("UI is functional with facility controls and no raw HTML string injection",()=>{
 const html=readFileSync(new URL("../facility-fusion.html",import.meta.url),"utf8");
 assert.ok(html.includes("facility_distance_fusion.mjs"));
 assert.ok(html.includes('id="facilities"'));assert.ok(html.includes('id="results"'));
 assert.ok(!html.includes("innerHTML"));
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Function(code.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});


test("15 real public-facility pedestrian observations, five candidates × three POIs",()=>{
 const x=load("oshima_three_facilities_pedestrian_routes_20261020.json");
 assert.equal(x.observations.length,15);assert.equal(x.unmeasured.length,0);
 assert.deepEqual(new Set(x.observations.map(o=>o.candidate_id)).size,5);
 assert.deepEqual(new Set(x.observations.map(o=>o.facility_id)).size,3);
 assert.ok(x.observations.every(o=>o.mode==="pedestrian_observed"&&o.source_url.startsWith("https://")));
});
test("actual civic-center walking distances distinguish 300m straight and 389m pedestrian reference",()=>{
 const routes=load("oshima_three_facilities_pedestrian_routes_20261020.json").observations;
 const a=evaluatePublishedLocationFusion(data(),registry(),"OH05",{includeStations:false,facilityConditions:[facility("koto-civic-center",500,"walk_m")],facilityRoutes:routes});
 assert.deepEqual(a.reference_compatible_candidates,["C05"]);
 assert.equal(a.fully_observed_across_candidates,true);
 assert.equal(a.ranked[0].evidence[0].observed_m,389);
 const b=evaluatePublishedLocationFusion(data(),registry(),"OH05",{includeStations:false,facilityConditions:[facility("koto-civic-center",500)],facilityRoutes:routes});
 assert.equal(b.ranked[0].evidence[0].observed_m,300);
});
test("actual school and large park route distances and large endpoint snap warnings retained",()=>{
 const routes=load("oshima_three_facilities_pedestrian_routes_20261020.json").observations;
 const a=evaluatePublishedLocationFusion(data(),registry(),"OH05",{includeStations:false,facilityConditions:[facility("oshima-nanou-school",600,"walk_m")],facilityRoutes:routes});
 assert.deepEqual(a.reference_compatible_candidates,["C05"]);
 const b=evaluatePublishedLocationFusion(data(),registry(),"OH01",{includeStations:false,facilityConditions:[facility("oshima-komatsugawa-park",1000,"walk_m")],facilityRoutes:routes});
 assert.deepEqual(b.reference_compatible_candidates,["C01"]);
 assert.equal(b.ranked[0].evidence[0].quality_warning,"endpoint_snap_review");
 assert.ok(routes.filter(x=>x.facility_id==="oshima-komatsugawa-park").every(x=>x.snap_end_m>=100));
});
test("all facility route observations remain public reference points, not doors or an accuracy study",()=>{
 const routes=load("oshima_three_facilities_pedestrian_routes_20261020.json").observations;
 const r=evaluatePublishedLocationFusion(data(),registry(),"OH05",{
  facilityConditions:[facility("koto-civic-center",500,"walk_m"),facility("oshima-nanou-school",600,"walk_m")],facilityRoutes:routes});
 assert.equal(r.fully_observed_across_candidates,true);
 assert.equal(r.confirmed_identity,false);assert.equal(r.statistical_accuracy,null);
 assert.ok(r.ranked.every(x=>x.identity_verified===false));
});
test("browser prototype loads real facility route fixture when available",()=>{
 const html=readFileSync(new URL("../facility-fusion.html",import.meta.url),"utf8");
 assert.ok(html.includes("oshima_three_facilities_pedestrian_routes_20261020.json"));
 assert.ok(html.includes("facilityRoutes:walkObservations?.observations??[]"));
});
