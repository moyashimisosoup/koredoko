import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildOjimaPublicMapReview,projectPublicReferencePoints}
 from "../src/oshima_reference_map_view.mjs";
const file=n=>JSON.parse(readFileSync(new URL("../examples/"+n,import.meta.url),"utf8"));
const data=()=>file("oshima_five_complete_20routes_20261020.json");
const reg=()=>file("oshima_public_facilities_20261020.json");
const routes=()=>file("oshima_three_facilities_pedestrian_routes_20261020.json");
const compare=(args={})=>buildOjimaPublicMapReview(data(),reg(),routes(),"OH05",args);
test("5 public UR buildings, four station representatives, three physical facilities produce 12 map points",()=>{
 const r=compare();
 assert.equal(r.candidate_count,5);
 assert.equal(r.station_reference_routes,20);
 assert.equal(r.stored_facility_reference_routes,15);
 assert.equal(r.matched_facility_reference_routes,0);
 assert.equal(r.map_points.length,12);
 assert.equal(new Set(r.map_points.map(p=>p.id)).size,12);
 assert.ok(r.map_points.every(p=>p.xPct>=0&&p.xPct<=100&&p.yPct>=0&&p.yPct<=100));
 assert.equal(r.drawing_is,"relative_coordinate_plot_without_map_tiles_or_walking_route_lines");
 assert.equal(r.independent_accuracy,null);
});
test("public station-only baseline remains original cohort's valid reference comparator",()=>{
 const r=compare();
 assert.equal(r.selected_public_facility,null);
 assert.equal(r.facility_condition_origin,"not_selected");
 assert.equal(r.reference_count_difference,0);
 assert.deepEqual(r.combined_reference_compatible_candidates,r.baseline_reference_compatible_candidates);
 assert.ok(r.ranked.every(x=>x.facility_observed_route_m===null));
});
test("station plus civic center 500m walking scenario reuses exactly 5 observed facility route records",()=>{
 const r=compare({facilityId:"koto-civic-center",metric:"walk_m",minMeters:0,maxMeters:500});
 assert.equal(r.matched_facility_reference_routes,5);
 assert.equal(r.facility_condition_origin,"user_selected_hypothetical_not_an_advertisement");
 assert.equal(r.selected_facility_measure,"walk_m");
 const c05=r.ranked.find(x=>x.id==="C05");
 assert.equal(c05.facility_observed_route_m,389);
 assert.equal(c05.facility_reference_m,389);
 assert.equal(c05.facility_route_evidence_status,"endpoint_review_required");
 assert.equal(c05.quality_certified,false);
 assert.equal(r.scoring_quality_certified,false);
 assert.equal(r.independent_accuracy,null);
});
test("all three facility choices may be compared without inventing additional routes",()=>{
 for(const id of reg().facilities.map(f=>f.id)){
  const r=compare({facilityId:id,metric:"walk_m",maxMeters:1000});
  assert.equal(r.matched_facility_reference_routes,5);
  assert.ok(r.ranked.every(x=>x.facility_observed_route_m!==null));
  assert.equal(r.selected_public_facility.id,id);
 }
});
test("facility route missing yields gap abstention, no straight-to-walk substitution",()=>{
 const data0=data(),reg0=reg(),routes0=routes();
 routes0.observations=routes0.observations.filter(x=>!(x.candidate_id==="C05"&&x.facility_id==="koto-civic-center"));
 const r=buildOjimaPublicMapReview(data0,reg0,routes0,"OH05",{facilityId:"koto-civic-center",metric:"walk_m",maxMeters:500});
 assert.equal(r.matched_facility_reference_routes,4);
 const c05=r.ranked.find(c=>c.id==="C05");
 assert.equal(c05.missing_conditions,1);
 assert.equal(c05.facility_observed_route_m,null);
 assert.equal(c05.facility_reference_m,null);
 assert.ok(c05.evidence.some(e=>e.status==="pedestrian_route_missing"));
});
test("choosing straight reference vs walking is explicit and cannot promote straight to measured",()=>{
 const r=compare({facilityId:"koto-civic-center",metric:"straight_m",maxMeters:500});
 const c05=r.ranked.find(x=>x.id==="C05");
 assert.equal(c05.facility_observed_route_m,null);
 assert.equal(c05.facility_reference_m,300);
 assert.ok(c05.evidence.some(x=>x.kind==="straight_distance"));
 assert.equal(c05.geographic_identity_confirmed,false);
});
test("tampered candidate coordinates, unknown facility, impossible distance range all fail closed",()=>{
 const d=data();d.candidates[0].lat=37;
 assert.throws(()=>buildOjimaPublicMapReview(d,reg(),routes(),"OH05"),/reference points/);
 assert.throws(()=>compare({facilityId:"nonexistent"}),/Unknown public facility/);
 assert.throws(()=>compare({facilityId:"koto-civic-center",maxMeters:-1}),/Unexpected/);
 assert.throws(()=>compare({facilityId:"koto-civic-center",minMeters:600,maxMeters:200}),/Unexpected/);
 assert.throws(()=>projectPublicReferencePoints([{id:"x",lat:1,lon:2,label:"xxx",type:"public_complex_reference"}]),/Invalid public reference points/);
});
test("map is immutable to original public evidence and contains zero private-home inferences",()=>{
 const x=data(),y=reg(),z=routes();const unchanged=[x,y,z].map(JSON.stringify);
 const res=buildOjimaPublicMapReview(x,y,z,"OH05",{facilityId:"oshima-nanou-school",metric:"walk_m",maxMeters:600});
 assert.deepEqual([x,y,z].map(JSON.stringify),unchanged);
 assert.equal(res.individual_private_dwellings_included,false);
 assert.ok(res.ranked.every(c=>!c.geographic_identity_confirmed));
 assert.ok(res.map_points.every(p=>p.public_source_url===null||p.public_source_url.startsWith("https://")));
});
