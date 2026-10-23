import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decodeValhallaPolyline6,haversineMeters,auditHibariPilotRouteShapeOffsets}
 from "../src/hibari_route_shape_endpoint_audit.mjs";
import {buildHibariRouteCoverage} from "../src/hibari_reference_point_plan.mjs";
const load=n=>JSON.parse(readFileSync(new URL("../examples/"+n,import.meta.url),"utf8"));
const plan=()=>buildHibariRouteCoverage(load("hibari_real_ads_prelocked_20261021.json"),
 load("hibari_poi_identities_20261021.json"),load("hibari_public_building_addresses_20261021.json"));
const geo=()=>load("hibari_v2_route_shape_offsets_20261022.json");
const pilot=()=>load("hibari_v2_exploratory_walks_20261022.json");
const refs=()=>load("hibari_geolonia_v2_address_number_20261022.json");
const audit=()=>auditHibariPilotRouteShapeOffsets(geo(),pilot(),refs(),plan());
test("actual Valhalla API polyline6 points compute sub-25m geometry endpoint offsets",()=>{
 const result=audit();
 assert.equal(result.observed_route_shapes,2);
 assert.equal(result.reference_endpoint_offsets_computed,2);
 assert.equal(result.geometry_endpoint_offset_warning_count,0);
 assert.deepEqual(result.rows.map(x=>x.route_length_m),[298,335]);
 assert.deepEqual(result.rows.map(x=>x.start_reference_to_geometry_m),[11.22,0.48]);
 assert.deepEqual(result.rows.map(x=>x.station_reference_to_geometry_m),[5,5]);
 assert.ok(result.rows.every(x=>x.within_25m_of_both_reference_points));
});
test("geometry endpoint match is NOT entrance, graph quality or independent ranking score",()=>{
 const res=audit();
 assert.equal(res.official_public_entrances_verified,0);
 assert.equal(res.quality_certified_routes,0);
 assert.equal(res.independent_accuracy,null);
 assert.ok(res.rows.every(x=>!x.independently_audited_building_door&&
   !x.independently_audited_station_exit&&!x.scoring_eligible));
});
test("encoded polyline6 matches saved recorded points for real responses",()=>{
 const o=geo().observations;
 assert.deepEqual(o.map(r=>decodeValhallaPolyline6(r.polyline6).length),[18,17]);
 assert.ok(haversineMeters(o[0].geometry_last_point,o[1].geometry_last_point)<0.02);
 assert.throws(()=>decodeValhallaPolyline6("_"),/Invalid|Incomplete|needs/);
 assert.throws(()=>decodeValhallaPolyline6(23),/Invalid/);
 assert.throws(()=>decodeValhallaPolyline6("?!"),/Invalid|Incomplete/);
});
test("tampered shape, claimed entrance, source request or offset invalidates audit",()=>{
 const changes=[
  g=>{g.observations[0].input_to_shape_start_offset_m=0;},
  g=>{g.observations[0].geometry_first_point.lat=33;},
  g=>{g.observations[0].polyline6=g.observations[1].polyline6;},
  g=>{g.observations[0].facility_entrance_verified=true;},
  g=>{g.observations[0].station_exit_verified=true;},
  g=>{g.observations[0].eligible_for_accuracy_scoring=true;},
  g=>{g.observations[0].route_request_url="https://example.org";},
  g=>{g.observations.push({...g.observations[0]});},
  g=>{g.quality_certified_routes=1;}
 ];
 for(const x of changes){const g=geo();x(g);
  assert.throws(()=>auditHibariPilotRouteShapeOffsets(g,pilot(),refs(),plan()));
 }
});
test("readback audit is pure, neither modifying previous route evidence nor original ad labels",()=>{
 const a=geo(),p=pilot(),r=refs(),f=plan();
 const originals=[a,p,r,f].map(x=>JSON.stringify(x));
 auditHibariPilotRouteShapeOffsets(a,p,r,f);
 assert.deepEqual([a,p,r,f].map(x=>JSON.stringify(x)),originals);
});
