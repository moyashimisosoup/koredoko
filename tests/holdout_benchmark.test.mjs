import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {predictPublishedSet,gradePublishedSet,BASELINE} from "../src/holdout_benchmark.mjs";
import {comparePublicStructure} from "../src/public_structure_compare.mjs";
const load=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const measured=()=>load("oji_holdout_measured_6routes_20261020.json");
const prereg=()=>load("oji_3complex_preregistered_20261020.json");
const structures=()=>load("oji_secondary_structure_20261020.json");
const answer={answers:[
  {advertisement_id:"H01",correct_candidate_id:"C01"},
  {advertisement_id:"H02",correct_candidate_id:"C02"},
  {advertisement_id:"H03",correct_candidate_id:"C03"}]};

test("preregistered public candidate/condition set predates route measurements",()=>{
 const p=prereg(),d=measured();
 assert.equal(p.candidates.length,3);assert.equal(p.stations.length,2);
 assert.equal(p.advertisements.length,3);
 assert.ok(p.candidates.every(c=>c.distances.length===0));
 assert.deepEqual(p.advertisements,d.advertisements);
 assert.deepEqual(p.stations,d.stations);
 assert.deepEqual(p.candidates.map(c=>c.id),d.candidates.map(c=>c.id));
});
test("six actual pedestrian route measurements are present, with snap audit",()=>{
 const d=measured();
 assert.equal(d.candidates.reduce((n,c)=>n+c.distances.length,0),6);
 assert.deepEqual(d.candidates.map(c=>c.distances.map(x=>x.meters)),[
  [560,1539],[598,1315],[511,845]]);
 assert.deepEqual(d.candidates.map(c=>c.distances.map(x=>x.snap_start_m)),[
  [33,33],[2,2],[12,12]]);
 assert.ok(d.candidates.every(c=>c.geocode_precision==="GSI_address_block_label"));
});
test("locked walking-only predictive order is not silently tuned on new cohort",()=>{
 const p=predictPublishedSet(measured());
 assert.equal(p.config.name,"walking-band-gap-v0.1");
 assert.equal(p.truth_used_during_prediction,false);
 assert.deepEqual(p.cases.map(x=>x.nominal_top1),["C02","C03","C03"]);
 assert.deepEqual(p.cases.map(x=>x.ranked_candidate_ids),[
  ["C02","C01","C03"],["C03","C02","C01"],["C03","C02","C01"]]);
 assert.deepEqual(p.cases.map(x=>x.ranked_gap_m),[
  [38,179,355],[66,313,499],[111,313,499]]);
});
test("all 3 held-out ads have two physical station clues",()=>{
 const p=predictPublishedSet(measured());
 assert.ok(p.cases.every(x=>x.destination_count===2));
 assert.ok(p.cases.every(x=>x.repeated_place_groups_suppressed===0));
});
test("fixed ±100m sensitivity leaves each of 3 comparisons uncertain",()=>{
 const p=predictPublishedSet(measured());
 assert.ok(p.cases.every(x=>x.rank_state==="stress_rank_ambiguous"));
 assert.ok(p.cases.every(x=>x.reference_stable_under_stress===false));
});
test("evaluation locks answer key to scoring AFTER prediction",()=>{
 const p=predictPublishedSet(measured());
 assert.equal("answers" in p,false);
 const r=gradePublishedSet(p,answer);
 assert.equal(r.evaluated_ads,3);
 assert.equal(r.universe_size,3);
 assert.equal(r.top1_count,1);
 assert.equal(r.top2_count,3);
 assert.equal(r.top3_count,3);
 assert.equal(r.abstained_count,3);
 assert.equal(r.eligible_assertions,0);
 assert.equal(r.general_population_accuracy_established,false);
});
test("baseline ranking failures cannot be erased by changing truth",()=>{
 const p=predictPublishedSet(measured());
 assert.deepEqual(gradePublishedSet(p,answer).cases.map(x=>x.true_candidate_rank),[2,2,1]);
});
test("scorer refuses alternate perturbation chosen after seeing data",()=>{
 assert.throws(()=>predictPublishedSet(measured(),{stressBuffer:400}),/preregistered/);
});
test("unknown or incomplete hidden key makes report fail closed",()=>{
 const p=predictPublishedSet(measured());
 assert.throws(()=>gradePublishedSet(p,{answers:answer.answers.slice(0,2)}),/size/);
 assert.throws(()=>gradePublishedSet(p,{answers:[...answer.answers.slice(0,2),{
  advertisement_id:"H03",correct_candidate_id:"unknown"}]}),/outside/);
});
test("public UR structures can be compared secondarily without changing walking-only predictions",()=>{
 const d=measured(),s=structures(),base=predictPublishedSet(d);
 const secondary=d.advertisements.map(ad=>comparePublicStructure(d,s,ad.id,{useStructure:true}));
 assert.deepEqual(secondary.map(x=>x.rank0),["C01","C02","C03"]);
 assert.ok(secondary.every(x=>x.independent_validation===false));
 assert.deepEqual(predictPublishedSet(d),base);
});
test("no test can elevate any candidate to identified building",()=>{
 const p=predictPublishedSet(measured());
 assert.ok(p.cases.every(x=>x.eligible_for_identity_assertion===false));
 assert.equal(BASELINE.source_of_truth,"held_out_until_after_ranking");
});
test("two candidates sharing similar station distance require competing station signal",()=>{
 const r=predictPublishedSet(measured()).cases[0];
 assert.ok(r.ranked_gap_m[0]<r.ranked_gap_m[1]);
 assert.equal(r.rank_state,"stress_rank_ambiguous");
});
