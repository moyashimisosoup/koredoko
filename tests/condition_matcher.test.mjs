import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateCandidates, canonicalConditions } from "../src/condition_matcher.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../examples/synthetic_multicondition_v0.1.json",import.meta.url),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));
const entry=(result,id)=>result.ranked.find(x=>x.candidate_id===id);
const detail=(entry,id)=>entry.details.find(x=>x.condition_id===id);

test("synthetic comparison selects A provisionally, never as verified",()=>{
 const result=evaluateCandidates(fixture());
 assert.deepEqual(result.ranked.map(x=>x.candidate_id),["A","C","B","D"]);
 assert.equal(result.has_unique_provisional_leader,true);
 assert.equal(result.can_confirm_property,false);
 assert.equal(result.candidate_selection_verified,false);
 assert.equal(result.scoring,"research_points_not_probability");
});
test("duplicate physical station is counted once",()=>{
 const result=evaluateCandidates(fixture());
 assert.equal(result.duplicate_conditions_suppressed,1);
 assert.equal(result.independent_place_conditions,3);
 assert.equal(result.evaluated_conditions,5);
 assert.equal(entry(result,"A").details.length,5);
});
test("three qualified paths plus two building attributes match A",()=>{
 const a=entry(evaluateCandidates(fixture()),"A");
 assert.equal(a.summary.matched,5);assert.equal(a.summary.conflicts,0);
 assert.equal(a.points,13);
});
test("strong negative evidence demotes B",()=>{
 const b=entry(evaluateCandidates(fixture()),"B");
 assert.equal(b.summary.conflicts,2);
 assert.equal(detail(b,"walk_b").status,"conflict");
 assert.equal(detail(b,"floors").status,"conflict");
});
test("straight-line constraints stay weak hints",()=>{
 const c=entry(evaluateCandidates(fixture()),"C");
 assert.equal(c.summary.matched,0);
 assert.equal(c.summary.weak_hints,5);
 assert.equal(detail(c,"walk_a").strength,"weak");
});
test("missing measurements abstain on candidate D",()=>{
 const d=entry(evaluateCandidates(fixture()),"D");
 assert.equal(d.points,0);assert.equal(d.summary.unknown,5);
});
test("dataset cannot claim completion even with one candidate",()=>{
 const input=fixture();input.candidates=[input.candidates[0]];
 const r=evaluateCandidates(input);
 assert.equal(r.ranked.length,1);assert.equal(r.candidate_selection_verified,false);
});
test("duplicates with conflicting advert minutes get withheld",()=>{
 const input=fixture();input.conditions[1].min_minutes=9;input.conditions[1].max_minutes=9;
 const r=evaluateCandidates(input);
 assert.equal(r.ambiguous_groups_withheld,1);
 assert.equal(detail(entry(r,"A"),"walk_a").reason,"conflicting_advertised_conditions");
});
test("different descriptions for identical place do not double score",()=>{
 const input=fixture();input.conditions.push({
 id:"another-label",kind:"walk",place_id:"station-a",label:"A駅（別広告表記）",
 min_minutes:7,max_minutes:7,travel_mode:"walk_only"
 });
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(a.points,13);
});
test("out-of-band network route within 40 meters of a boundary is review, not conflict",()=>{
 const input=fixture();input.candidates[0].distances[0].meters=578;
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").status,"review");
});
test("out-of-band certified route over 40m away is a conflict",()=>{
 const input=fixture();input.candidates[0].distances[0].meters=640;
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").status,"conflict");
});
test("unpinned pedestrian graph cannot count as strong or a hint",()=>{
 const input=fixture();input.candidates[0].distances[0].graph_pinned=false;
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").status,"unknown");
 assert.equal(detail(a,"walk_a").reason,"entrance_or_graph_not_verified");
});
test("snap over threshold forces route to unknown",()=>{
 const input=fixture();input.candidates[0].distances[0].endpoint_snap_m=44;
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").status,"unknown");
});
test("straight-line outside upper is only caution, not confirmed conflict",()=>{
 const input=fixture();input.candidates[2].distances[0].meters=790;
 const c=entry(evaluateCandidates(input),"C");
 assert.equal(detail(c,"walk_a").status,"caution");
});
test("multiple discordant strong sources are not silently cherry-picked",()=>{
 const input=fixture();
 input.candidates[0].distances.push({...input.candidates[0].distances[0],meters:1000,source_id:"other-qualified-survey"});
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").status,"unknown");
 assert.equal(detail(a,"walk_a").reason,"conflicting_strong_distance_sources");
});
test("range walking minutes are supported as one interval",()=>{
 const input=fixture();input.conditions[0].min_minutes=7;input.conditions[0].max_minutes=11;
 input.conditions[1].min_minutes=7;input.conditions[1].max_minutes=11;
 const a=entry(evaluateCandidates(input),"A");
 assert.equal(detail(a,"walk_a").advertised_lower_exclusive_m,480);
 assert.equal(detail(a,"walk_a").advertised_upper_inclusive_m,880);
});
test("multi-modal bus-plus-walk constraint is rejected rather than mistreated as pure walking",()=>{
 const input=fixture();input.conditions[0].travel_mode="bus_plus_walk";
 assert.throws(()=>evaluateCandidates(input),/walking/);
});
test("all candidate evidence missing yields abstain",()=>{
 const input=fixture();input.candidates=[input.candidates[3]];
 const r=evaluateCandidates(input);
 assert.equal(r.ranking_state,"abstain");
 assert.equal(r.has_unique_provisional_leader,false);
});
test("missing source identifiers rejected",()=>{
 const input=fixture();input.candidates[0].distances[0].source_id="";
 assert.throws(()=>evaluateCandidates(input),/distance measurement/);
});
test("duplicate condition IDs rejected",()=>{
 const input=fixture();input.conditions[1].id="walk_a";
 assert.throws(()=>evaluateCandidates(input),/duplicated/);
});
test("duplicate candidate IDs rejected",()=>{
 const input=fixture();input.candidates[1].id="A";
 assert.throws(()=>evaluateCandidates(input),/candidate/);
});
test("reject invalid distance NaN",()=>{
 const input=fixture();input.candidates[0].distances[0].meters=NaN;
 assert.throws(()=>evaluateCandidates(input),/distance/);
});
test("score is not exposed as percentage confidence",()=>{
 const r=evaluateCandidates(fixture());
 assert.equal("confidence_percent" in r,false);
 assert.equal("location_is_verified" in r,false);
 assert.ok(r.ranked.every(x=>x.result_state==="unverified_comparison"));
});
test("original fixture remains unchanged",()=>{
 const input=fixture();const before=JSON.stringify(input);
 evaluateCandidates(input);
 assert.equal(JSON.stringify(input),before);
});
test("input is bounded to 30 conditions and 50 candidates",()=>{
 const a=fixture();a.conditions=Array.from({length:31},(_,i)=>({...a.conditions[0],id:"u"+i,place_id:"u"+i}));
 assert.throws(()=>evaluateCandidates(a),/size/);
 const b=fixture();b.candidates=Array.from({length:51},(_,i)=>({...b.candidates[0],id:"u"+i}));
 assert.throws(()=>evaluateCandidates(b),/size/);
});
