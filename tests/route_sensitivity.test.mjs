import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditPublicRankStability,walkingGapStressInterval}
 from "../src/route_sensitivity.mjs";

const fixture=()=>JSON.parse(readFileSync(
 new URL("../examples/kamata_public_4complex_12routes_20261020.json",import.meta.url),"utf8"));
const ads=["AD-K1","AD-K2","AD-K3","AD-K4"];
const range={place_id:"station-a",min_minutes:6,max_minutes:8};
test("distance inside band has zero gap without perturbation",()=>{
 assert.deepEqual(walkingGapStressInterval(550,range,0),{
  min_gap_m:0,max_gap_m:0,observed_gap_m:0,tested_route_low_m:550,tested_route_high_m:550});
});
test("distance outside band is measured against closest boundary",()=>{
 const r=walkingGapStressInterval(840,range,0);
 assert.equal(r.observed_gap_m,200);
 assert.equal(r.min_gap_m,200);assert.equal(r.max_gap_m,200);
});
test("uncertain route crossing walking band may have zero minimum gap",()=>{
 const r=walkingGapStressInterval(840,range,200);
 assert.equal(r.min_gap_m,0);assert.equal(r.max_gap_m,400);
});
test("support a distance interval below advertised band",()=>{
 const r=walkingGapStressInterval(220,range,50);
 assert.equal(r.min_gap_m,130);assert.equal(r.max_gap_m,230);
});
test("reject non-declared uncertainty ranges and bad distance",()=>{
 for(const v of [-1,75,101,Infinity,"100",null]) {
  assert.throws(()=>walkingGapStressInterval(500,range,v),/Invalid/);
 }
 assert.throws(()=>walkingGapStressInterval(-2,range,100),/Invalid/);
});
test("at 100m test perturbation all four nominal leaders remain stress-stable references",()=>{
 const data=fixture();
 for(const ad of ads){
  const r=auditPublicRankStability(data,ad,100);
  assert.equal(r.reference_rank_robust_in_stress_window,true);
  assert.equal(r.rank_state,"stress_stable_reference_rank");
  assert.equal(r.can_confirm_building,false);
  assert.equal(r.allow_automatic_candidate_exclusion,false);
 }
});
test("at 200m test perturbation all four rankings lose robust separation",()=>{
 const data=fixture();
 for(const ad of ads){
  const r=auditPublicRankStability(data,ad,200);
  assert.equal(r.reference_rank_robust_in_stress_window,false);
  assert.equal(r.rank_state,"stress_rank_ambiguous");
 }
});
test("a stress-stable but WRONG public winner is never reported verified",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K2",100);
 assert.equal(r.nominal_top_candidate_id,"ur-kamata-ekimae");
 assert.equal(r.reference_rank_robust_in_stress_window,true);
 assert.equal(r.top_has_large_endpoint_snap,true);
 assert.equal(r.can_confirm_building,false);
});
test("two reference points for the same physical station do not double-weight",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K2",100);
 assert.equal(r.candidates[0].evidence.length,2);
 assert.equal(r.candidates[0].incomplete_route_count,0);
});
test("candidate with 54m road snap gets explicit review marker",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K2",0);
 const target=r.candidates.find(x=>x.candidate_id==="ur-kamata-honcho");
 assert.equal(target.snap_review,true);
 assert.ok(target.evidence.every(x=>x.start_snap_m===54));
});
test("candidate with 3m road snap still cannot be certified without exit measurement",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K3",0);
 const top=r.candidates[0];
 assert.equal(top.snap_review,false);
 assert.ok(top.evidence.every(x=>x.station_exit_verified===false));
 assert.equal(r.can_confirm_building,false);
});
test("missing path prevents robust-first claim",()=>{
 const d=fixture();d.candidates[0].distances=d.candidates[0].distances.filter(x=>x.place_id!=="jr-kamata");
 const r=auditPublicRankStability(d,"AD-K1",100);
 assert.equal(r.rank_state,"incomplete");
 assert.equal(r.reference_rank_robust_in_stress_window,false);
});
test("choose only one destination and preserve explicit provisional status",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K1",100,["jr-kamata"]);
 assert.equal(r.candidates[0].evidence.length,1);
 assert.equal(r.requires_exit_and_entrance_validation,true);
});
test("at no stress and unequal gaps nominal rank is separated, but never verified",()=>{
 const r=auditPublicRankStability(fixture(),"AD-K1",0);
 assert.equal(r.reference_rank_robust_in_stress_window,true);
 assert.equal(r.official_entrance_coordinates_checked,false);
 assert.equal(r.route_graph_pinned,false);
});
test("stress intervals expand monotonically with larger buffers",()=>{
 const a=auditPublicRankStability(fixture(),"AD-K4",50);
 const b=auditPublicRankStability(fixture(),"AD-K4",200);
 for(let i=0;i<a.candidates.length;i++){
  assert.ok(b.candidates[i].min_total_gap_m<=a.candidates[i].min_total_gap_m);
  assert.ok(b.candidates[i].max_total_gap_m>=a.candidates[i].max_total_gap_m);
 }
});
test("unsafe dataset must be rejected before computation",()=>{
 const d=fixture();d.candidates[0].source_url="http://unknown.invalid";
 assert.throws(()=>auditPublicRankStability(d,"AD-K1",100),/Invalid public candidate/);
});
test("UI exposes stress comparison and does not use innerHTML",()=>{
 const html=readFileSync(new URL("../public-buildings.html",import.meta.url),"utf8");
 assert.match(html,/route_sensitivity\.mjs/);
 assert.match(html,/id="stressBuffer"/);
 assert.match(html,/id="stressStatus"/);
 assert.ok(html.includes("textContent"));
 assert.ok(!html.includes("innerHTML"));
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
