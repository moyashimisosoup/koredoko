import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {comparePublicStructure,validateStructureEvidence} from "../src/public_structure_compare.mjs";

const load=path=>JSON.parse(readFileSync(new URL("../examples/"+path,import.meta.url),"utf8"));
const fixture=()=>load("kamata_public_4complex_12routes_20261020.json");
const structures=()=>load("kamata_public_structures_20261020.json");
const expected={"AD-K1":"ur-kamata-ekimae","AD-K2":"ur-kamata-honcho",
 "AD-K3":"ur-shareru-shinkamata","AD-K4":"ur-patio-shinkamata"};

test("public structure source records valid and clearly correlated",()=>{
 assert.doesNotThrow(()=>validateStructureEvidence(structures()));
});
test("walking-only retains the known incorrect top rank for AD-K2",()=>{
 const r=comparePublicStructure(fixture(),structures(),"AD-K2",{useStructure:false});
 assert.equal(r.rank0,"ur-kamata-ekimae");
 assert.equal(r.independent_validation,false);
});
test("published structure comparison changes AD-K2 top candidate in same dataset",()=>{
 const r=comparePublicStructure(fixture(),structures(),"AD-K2");
 assert.equal(r.rank0,"ur-kamata-honcho");
 assert.equal(r.ranked[0].structure_status,"same");
 assert.equal(r.ranked.find(x=>x.candidate_id==="ur-kamata-ekimae").structure_status,"different");
 assert.equal(r.can_eliminate_candidate,false);
});
test("all four examples align with known published identities when using official structures",()=>{
 const data=fixture(),s=structures();
 for(const [adId,correct] of Object.entries(expected)){
  const r=comparePublicStructure(data,s,adId);
  assert.equal(r.rank0,correct);
  assert.equal(r.estimated_true_accuracy,null);
  assert.equal(r.building_verified,false);
  assert.equal(r.ranked.length,4);
 }
});
test("switching to walking-only returns previous reproducible result",()=>{
 const a=comparePublicStructure(fixture(),structures(),"AD-K2",{useStructure:true});
 const b=comparePublicStructure(fixture(),structures(),"AD-K2",{useStructure:false});
 assert.notEqual(a.rank0,b.rank0);
 assert.equal(b.mode,"walk_reference_only");
});
test("same structure does not prove independent corroboration",()=>{
 const r=comparePublicStructure(fixture(),structures(),"AD-K1");
 assert.equal(r.independent_validation,false);
 assert.ok(r.ranked.every(x=>x.independent_structure_evidence===false));
 assert.equal(r.source_correlation,"UR_advertisement_and_candidate_metadata_from_same_primary_provider");
});
test("complex structure may not represent every unit or block",()=>{
 const r=comparePublicStructure(fixture(),structures(),"AD-K2");
 assert.equal(r.scope_limit,"complex_overview_not_each_building");
});
test("missing candidate structure remains in results as unknown, not rejected",()=>{
 const x=structures();x.candidates=x.candidates.filter(c=>c.candidate_id!=="ur-kamata-honcho");
 const r=comparePublicStructure(fixture(),x,"AD-K2");
 assert.equal(r.ranked.length,4);
 assert.equal(r.ranked.find(c=>c.candidate_id==="ur-kamata-honcho").structure_status,"unknown");
});
test("reject structural evidence without original source",()=>{
 const x=structures();x.candidates[0].source_url="";
 assert.throws(()=>comparePublicStructure(fixture(),x,"AD-K2"),/Invalid structure/);
});
test("reject falsely independent provenance in this demonstration",()=>{
 const x=structures();x.ads[0].source_relation="independent_survey";
 assert.throws(()=>validateStructureEvidence(x),/source-correlated/);
});
test("advertisement with no listed structure abstains",()=>{
 const x=structures();x.ads=x.ads.filter(a=>a.advertisement_id!=="AD-K1");
 assert.throws(()=>comparePublicStructure(fixture(),x,"AD-K1"),/No official/);
});
test("no hard exclusions even for mismatched structure",()=>{
 const r=comparePublicStructure(fixture(),structures(),"AD-K2");
 assert.equal(r.ranked.filter(x=>x.structure_status==="different").length,2);
 assert.equal(r.candidate_count,4);
 assert.equal(r.can_eliminate_candidate,false);
});
test("UI is linked and safe to render",()=>{
 const html=readFileSync(new URL("../public-buildings.html",import.meta.url),"utf8");
 assert.match(html,/src\/public_structure_compare\.mjs/);
 assert.match(html,/id="structureToggle"/);
 assert.match(html,/id="structureStatus"/);
 assert.ok(html.includes("textContent"));
 assert.ok(!html.includes("innerHTML"));
 const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
