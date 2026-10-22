import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeAreaLandmarks,parseAreaInput,solveSearchArea} from "../src/area_overlap_solver.mjs";
const file=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const get=()=>({
 pois:file("hibari_poi_identities_20261021.json"),
 refs:file("hibari_geolonia_v2_address_number_20261022.json"),
 towns:file("hibari_geolonia_town_chome_references_20261022.json")
});
const registry=()=>{const {pois,refs,towns}=get();return {landmarks:makeAreaLandmarks(pois,refs,towns),towns:towns.records}};
const H02="西東京市 谷戸町三丁目\nひばりが丘郵便局：徒歩2分（約133m）\nひばりが丘PARCO：徒歩3分（約236m）";
test("API-derived landmark address references permit unknown property type and no pre-registered building",()=>{
 const {landmarks}=registry();
 assert.equal(landmarks.length,11);
 assert.ok(landmarks.every(x=>x.is_entrance===false));
 assert.equal(landmarks.filter(x=>x.precision==="town_chome_reference").length,4);
 assert.ok(!landmarks.some(x=>x.id.startsWith("building:")));
});
test("advertised H02 facility evidence + partial address produces broad AREA instead of building candidate ranks",()=>{
 const {landmarks,towns}=registry();
 const evidence=parseAreaInput(H02,landmarks,towns);
 assert.equal(evidence.constraints.length,2);
 assert.equal(evidence.ignored.length,0);
 assert.ok(evidence.partialAddress?.name.includes("谷戸町"));
 assert.ok(evidence.constraints.every(x=>x.precision==="address_number_reference"));
 const r=solveSearchArea(evidence);
 assert.equal(r.state,"exploratory_areas");
 assert.ok(r.region_area_km2>=0.4);
 assert.ok(r.region_area_km2<35);
 assert.equal(r.center_point,null);
 assert.equal(r.property_candidates,null);
 assert.equal(r.probability,null);
 assert.equal(r.clues_used,2);
 assert.equal(r.regions.type,"FeatureCollection");
 assert.ok(r.regions.features.length>=1);
 assert.ok(r.regions.features.every(x=>x.geometry.type==="MultiPolygon"));
 assert.ok(r.regions.features.every(x=>x.geometry.coordinates.length>=1));
});
test("advertised H01 park and school may use different position precisions, without excluding coarse data",()=>{
 const {landmarks,towns}=registry();
 const raw="ひばりが丘公園・・・約230ｍ（徒歩3分）\n西東京市立中原小学校・・・約880ｍ（徒歩11分）";
 const p=parseAreaInput(raw,landmarks,towns);
 assert.deepEqual(p.constraints.map(c=>c.precision),["town_chome_reference","address_number_reference"]);
 const r=solveSearchArea(p);
 assert.equal(r.clues_used,2);
 assert.ok(r.grid.length>=10);
 assert.ok(!JSON.stringify(r).includes("K01"));
});
test("station and property-name-ish store are not confused by substring aliases",()=>{
 const {landmarks,towns}=registry();
 const p=parseAreaInput("西友ひばりヶ丘店 徒歩2分\nひばりヶ丘駅 徒歩4分",landmarks,towns);
 assert.equal(p.constraints.length,2);
 assert.ok(p.constraints[0].landmark_id.startsWith("facility:"));
 assert.equal(p.constraints[1].landmark_id,"station:seibu-hibarigaoka");
});
test("unregistered facilities and malformed distances are visibly ignored, not filled in",()=>{
 const {landmarks,towns}=registry();
 const p=parseAreaInput("知らないスーパー 徒歩2分\nひばりが丘PARCO 徒歩700分",landmarks,towns);
 assert.equal(p.constraints.length,0);
 assert.equal(p.ignored.length,2);
 const r=solveSearchArea(p);
 assert.equal(r.state,"insufficient_landmarks");
 assert.deepEqual(r.regions,[]);
 assert.equal(r.accuracy,null);
});
test("contradictory walking minutes and meter claims remain visible but NEVER narrow the area",()=>{
 const {landmarks,towns}=registry();
 const bad="西東京市立谷戸第二小学校：徒歩15分（約1537m）";
 const p=parseAreaInput(H02+"\n"+bad,landmarks,towns);
 assert.equal(p.constraints.length,2);
 assert.equal(p.ignored.length,1);
 assert.match(p.ignored[0].reason,/不整合/);
 assert.equal(p.ignored[0].quote,bad);
 assert.equal(p.ignored[0].stated_meters,1537);
 assert.equal(p.ignored[0].stated_minutes,15);
 assert.deepEqual(solveSearchArea(p).grid,solveSearchArea(parseAreaInput(H02,landmarks,towns)).grid);
 assert.equal(solveSearchArea(p).center_point,null);
});
test("unqualified 590m park clue is kept as a weak hint rather than a measured walking distance",()=>{
 const {landmarks,towns}=registry();
 const park=parseAreaInput("谷戸イチョウ公園（現地より約590m）",landmarks,towns);
 assert.equal(park.constraints.length,1);
 assert.equal(park.constraints[0].metric,"distance_mode_unknown");
 const p=parseAreaInput("西友ひばりヶ丘店・・・約110m（徒歩2分）\nPARCOひばりが丘・・・約210m（徒歩3分）\n谷戸イチョウ公園（現地より約590m）",landmarks,towns);
 assert.equal(p.constraints.length,3);
 assert.equal(p.constraints[2].metric,"distance_mode_unknown");
 const r=solveSearchArea(p);
 assert.equal(r.clues_used,3);
 assert.equal(r.center_point,null);
});
test("duplicate, compound same-line clues are not counted as independent intersections",()=>{
 const {landmarks,towns}=registry();
 const p=parseAreaInput("ひばりが丘公園と西東京市立中原小学校 徒歩5分\nひばりが丘PARCO 徒歩3分\nPARCOひばりが丘 徒歩5分",landmarks,towns);
 assert.equal(p.constraints.length,1);
 assert.equal(p.ignored.length,2);
});
test("address-only text cannot pretend the town representative is a parcel boundary",()=>{
 const {landmarks,towns}=registry();
 const p=parseAreaInput("谷戸町二丁目の土地",landmarks,towns);
 assert.equal(p.constraints.length,0);
 assert.equal(p.partialAddress.use,"soft_context_not_a_geographic_boundary");
 const r=solveSearchArea(p);
 assert.equal(r.state,"insufficient_landmarks");
});
test("the solver does not inspect home/land/apartment building identifiers or answer mappings",()=>{
 const {landmarks,towns}=registry();
 const base=parseAreaInput(H02,landmarks,towns);
 const a=solveSearchArea(base);
 const b=solveSearchArea({...base,listing_type:"single_family_home",exact_address:"SECRET"});
 assert.deepEqual(a,b);
 assert.equal(b.accuracy,null);
 assert.equal(b.grid_step_m,200);
 assert.equal(b.regions.features[0].properties.interpretation,"coarse_search_footprint_not_a_specific_property");
});
test("tampered cohort and large user payload fail closed",()=>{
 const {pois,refs,towns}=get();const fake={...refs,cohort_id:"other"};
 assert.throws(()=>makeAreaLandmarks(pois,fake,towns),/mismatch/);
 assert.throws(()=>parseAreaInput("x".repeat(25001),[],[]));
 assert.throws(()=>solveSearchArea({constraints:[]},{stepM:5}),/privacy/);
});
