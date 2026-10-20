import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {asSinglePointRoutes,validateRouteOptions,evaluateExitAwarePublicCandidates} from "../src/multi_endpoint_routes.mjs";
import {comparePublicCandidates} from "../src/public_building_rank.mjs";
const load=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const oji=()=>load("oji_holdout_measured_6routes_20261020.json");
const kamata=()=>load("kamata_public_4complex_12routes_20261020.json");
const clone=x=>JSON.parse(JSON.stringify(x));
const make=(candidate,place,origin,exitId,meters)=>({
  candidate_id:candidate,place_id:place,origin_id:origin,exit_id:exitId,
  origin_type:"address_reference",exit_type:"station_exit",
  exit_source_url:"https://www.tokyometro.jp/station/oji-kamiya/",
  meters,snap_start_m:5,snap_end_m:2,
  provenance:"synthetic_test_only",route_source:"synthetic_test_not_actual_measurement",
  identity_independent:false
});
test("six genuine reference routes retained when adapted to multi-option format",()=>{
 const d=oji(),options=asSinglePointRoutes(d);
 assert.equal(options.routes.length,6);
 assert.ok(options.routes.every(r=>r.exit_type==="station_reference"));
 assert.doesNotThrow(()=>validateRouteOptions(d,options));
});
test("reference-only nearest-route ranking exactly matches locked Oji baseline",()=>{
 const d=oji(),options=asSinglePointRoutes(d);
 for(const ad of d.advertisements){
  const prior=comparePublicCandidates(d,ad.id);
  const out=evaluateExitAwarePublicCandidates(d,options,ad.id);
  assert.deepEqual(out.rows.map(x=>x.candidate_id),prior.ranked.map(x=>x.candidate_id));
  assert.deepEqual(out.rows.map(x=>x.nominal_gap_m),prior.ranked.map(x=>x.total_absolute_gap_m));
  assert.equal(out.identity_confirmed,false);
  assert.equal(out.official_entrances_verified,false);
  assert.ok(out.rows.every(x=>x.evidence.every(e=>e.alternative_routes===1)));
 }
});
test("same nearest-route algorithm reproduces existing Kamata development ranking",()=>{
 const d=kamata(),options=asSinglePointRoutes(d);
 for(const ad of d.advertisements){
  const prior=comparePublicCandidates(d,ad.id);
  const out=evaluateExitAwarePublicCandidates(d,options,ad.id);
  assert.deepEqual(out.rows.map(x=>x.candidate_id),prior.ranked.map(x=>x.candidate_id));
  assert.equal(out.distinct_station_conditions,prior.station_condition_count);
 }
});
test("a second measured alternative is selected by SHORTEST distance, not closest match to ad",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 // C02/H01: 598m is inside 6–7min band (400,560]. 380m is outside.
 // A cherry-picking algorithm would choose 598m; nearest-exit rule picks 380m.
 // For H01, the baseline C02 sample is 598m (38m above upper 560).
 o.routes.push(make("C02","oji-kamiya","C02:gsi-address-reference","oji-exit-B",380));
 const out=evaluateExitAwarePublicCandidates(d,o,"H01");
 const candidate=out.rows.find(x=>x.candidate_id==="C02");
 const e=candidate.evidence.find(x=>x.place_id==="oji-kamiya");
 assert.equal(e.nominal_m,380);
 assert.equal(e.selected_rule,"minimum_measured_pedestrian_distance");
 assert.deepEqual(e.observed_range_m,[380,598]);
 assert.equal(e.nominal_gap_m,20); // under 6–7 band (400,560]
 assert.equal(e.min_possible_gap_m,20);
 assert.equal(e.max_possible_gap_m,38);
 assert.equal(e.alternative_routes,2);
 assert.equal(e.station_exit_points_supplied,1);
});
test("adding a genuinely shorter station exit route can change candidate reference ranking",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 const prior=evaluateExitAwarePublicCandidates(d,o,"H01");
 o.routes.push(make("C01","oji-kamiya","C01:gsi-address-reference","exit-2",390));
 const out=evaluateExitAwarePublicCandidates(d,o,"H01");
 assert.notDeepEqual(out.rows.map(x=>x.nominal_gap_m),prior.rows.map(x=>x.nominal_gap_m));
 assert.ok(out.rows.find(c=>c.candidate_id==="C01").evidence[0].alternative_routes===2);
});
test("multi-option uncertainty cannot be mistaken for independently surveyed exit proof",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes.push(make("C01","oji-kamiya","C01:gsi-address-reference","exit-2",490));
 const r=evaluateExitAwarePublicCandidates(d,o,"H01");
 assert.equal(r.required_external_accuracy_validation,true);
 assert.equal(r.identity_confirmed,false);
 assert.ok(r.rows.every(c=>c.can_confirm_identity===false));
});
test("station alias is folded to one physical place without double counting",()=>{
 const d=kamata(),o=asSinglePointRoutes(d);
 const result=evaluateExitAwarePublicCandidates(d,o,"AD-K2");
 assert.equal(result.duplicate_line_constraints,1);
 assert.equal(result.distinct_station_conditions,2);
 assert.ok(result.rows.every(x=>x.evidence.length===2));
});
test("missing options never produce zero gap or false rank eligibility",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes=o.routes.filter(x=>!(x.candidate_id==="C01"&&x.place_id==="oji-kamiya"));
 const result=evaluateExitAwarePublicCandidates(d,o,"H01");
 const c=result.rows.find(x=>x.candidate_id==="C01");
 assert.equal(c.nominal_gap_m,null);
 assert.equal(c.min_total_gap_m,null);
 assert.equal(c.missing_destinations,1);
 assert.equal(result.rank_reference_robust_across_supplied_routes,false);
});
test("duplicate origin-to-exit pair rejected",()=>{
 const d=oji(),o=asSinglePointRoutes(d);o.routes.push(clone(o.routes[0]));
 assert.throws(()=>validateRouteOptions(d,o),/Duplicate/);
});
test("invented identity independence flagged as unsafe input",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes[0].identity_independent=true;
 assert.throws(()=>validateRouteOptions(d,o),/Invalid/);
});
test("claimed actual exit without source URL is refused",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes[0].exit_type="station_exit";
 assert.throws(()=>validateRouteOptions(d,o),/Exit provenance required/);
});
test("measured pedestrian snap must be nonnegative",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes[0].snap_end_m=-1;
 assert.throws(()=>validateRouteOptions(d,o),/Invalid/);
});
test("public station exit catalog has identifiers but no fabricated coordinates",()=>{
 const data=load("oji_exit_identifiers_no_coords_20261020.json");
 assert.equal(data.readiness.ready_for_valhalla,false);
 assert.equal(data.stations.reduce((n,s)=>n+s.exits.length,0),7);
 assert.ok(data.stations.every(s=>s.exits.every(e=>e.lat===null&&e.lon===null)));
});
test("candidate option count is bounded even for named public estates",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 for(let i=0;i<16;i++)o.routes.push(make("C01","oji-kamiya","C01:point-"+i,"exit-"+i,500+i));
 assert.throws(()=>validateRouteOptions(d,o),/Too many/);
});
test("route min and max penalty bounds are monotonic and use available measured options",()=>{
 const d=oji(),o=asSinglePointRoutes(d);
 o.routes.push(make("C01","oji-kamiya","C01:gsi-address-reference","exit2",460));
 const res=evaluateExitAwarePublicCandidates(d,o,"H01");
 for(const row of res.rows){
  assert.ok(row.min_total_gap_m<=row.max_total_gap_m);
  for(const evidence of row.evidence){
   assert.ok(evidence.min_possible_gap_m<=evidence.max_possible_gap_m);
  }
 }
});
test("UI explains no real station exit routes have been confirmed",()=>{
 const html=readFileSync(new URL("../endpoint-lab.html",import.meta.url),"utf8");
 assert.match(html,/multi_endpoint_routes\.mjs/);
 assert.match(html,/実際の駅出口の道路距離は未取得/);
 assert.equal(html.includes("innerHTML"),false);
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
