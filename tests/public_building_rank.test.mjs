import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {comparePublicCandidates,combinePhysicalStations,validatePublicDataset}
 from "../src/public_building_rank.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../examples/kamata_public_4complex_12routes_20261020.json",import.meta.url),"utf8"));
const copy=o=>JSON.parse(JSON.stringify(o));
test("four public UR complexes have twelve measured common-station routes",()=>{
 const doc=fixture();assert.doesNotThrow(()=>validatePublicDataset(doc));
 assert.equal(doc.candidates.length,4);
 assert.deepEqual(doc.candidates.map(c=>c.distances.length),[3,3,3,3]);
});
test("target AD-K1 ranks public Kamata-ekimae as closest reference gap",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K1");
 assert.equal(r.nominal_top_candidate_id,"ur-kamata-ekimae");
 assert.deepEqual(r.ranked.map(x=>x.total_absolute_gap_m),[423,1142,2327,2499]);
 assert.equal(r.station_condition_count,2);
});
test("target AD-K2 intentionally fails: nominal ranking prefers a different official building",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K2");
 assert.equal(r.duplicate_line_constraints,1);
 assert.equal(r.station_condition_count,2);
 assert.equal(r.nominal_top_candidate_id,"ur-kamata-ekimae");
 assert.equal(r.ranked[0].total_absolute_gap_m,0);
 const official=r.ranked.find(x=>x.candidate_id==="ur-kamata-honcho");
 assert.ok(official.total_absolute_gap_m>0);
 assert.equal(r.verified_identification,false);
});
test("range conditions conservatively merged by physical station not double weighted",()=>{
 const ad=fixture().advertisements[1];
 const s=combinePhysicalStations(ad.conditions);
 assert.equal(s.stations.length,2);assert.equal(s.duplicate_line_constraints,1);
 assert.deepEqual([s.stations[0].min_minutes,s.stations[0].max_minutes],[6,9]);
});
test("AD-K3 Shareru-Shinkamata is first on nominal routes",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K3");
 assert.equal(r.nominal_top_candidate_id,"ur-shareru-shinkamata");
 assert.equal(r.ranked[0].total_absolute_gap_m,141);
});
test("AD-K4 Patio is first on nominal routes",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K4");
 assert.equal(r.nominal_top_candidate_id,"ur-patio-shinkamata");
 assert.equal(r.ranked[0].total_absolute_gap_m,143);
});
test("all four are already public named complexes; no private homes or room units",()=>{
 const data=fixture();
 for(const c of data.candidates){
  assert.match(c.source_url,/^https:\/\/www\.ur-net\.go\.jp\//);
  assert.ok(!("unit" in c));
 }
});
test("rank is never reported as calibrated probability or verified geolocation",()=>{
 for(const ad of fixture().advertisements){
  const r=comparePublicCandidates(fixture(),ad.id);
  assert.equal(r.verified_identification,false);
  assert.equal(r.quality_review_needed,true);
  assert.equal(r.ranked.every(x=>x.can_confirm_match===false&&x.location_probability===null),true);
 }
});
test("deviation is signed by distance shorter or longer than band",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K4");
 const c=r.ranked.find(x=>x.candidate_id==="ur-patio-shinkamata");
 assert.equal(c.evidence[0].difference_signed_m,45);
 assert.equal(c.evidence[1].difference_signed_m,-98);
});
test("origin snap above 25m is explicit, not claimed verified",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K2");
 const own=r.ranked.find(x=>x.candidate_id==="ur-kamata-honcho");
 assert.equal(own.evidence[0].quality,"endpoint_snap_review");
 assert.equal(own.evidence[1].road_start_snap_m,54);
});
test("selecting only JR station changes number of independent conditions",()=>{
 const r=comparePublicCandidates(fixture(),"AD-K1",["jr-kamata"]);
 assert.equal(r.station_condition_count,1);
 assert.equal(r.ranked[0].evidence.length,1);
});
test("unmeasured route sorts last and remains missing, not fabricated zero gap",()=>{
 const doc=fixture();doc.candidates[1].distances.pop();doc.candidates[1].distances.pop();
 const r=comparePublicCandidates(doc,"AD-K2");
 const c=r.ranked.find(x=>x.candidate_id==="ur-kamata-honcho");
 assert.equal(c.total_absolute_gap_m,null);
 assert.equal(c.evidence[1].status,"missing");
});
test("bad station coordinate is rejected",()=>{
 const doc=fixture();doc.stations[0].lat=999;
 assert.throws(()=>comparePublicCandidates(doc,"AD-K1"),/Invalid station/);
});
test("negative or invented walking measurement is rejected",()=>{
 const doc=fixture();doc.candidates[1].distances[0].meters=-2;
 assert.throws(()=>comparePublicCandidates(doc,"AD-K1"),/Invalid measured/);
});
test("duplicate route station within candidate rejected",()=>{
 const doc=fixture();doc.candidates[1].distances.push(copy(doc.candidates[1].distances[0]));
 assert.throws(()=>comparePublicCandidates(doc,"AD-K1"),/Invalid measured/);
});
test("missing advertisement id fails",()=>assert.throws(()=>comparePublicCandidates(fixture(),"BAD"),/Unknown/));
test("cannot compare zero active conditions",()=>{
 assert.throws(()=>comparePublicCandidates(fixture(),"AD-K1",["nonexistent"]),/At least one/);
});
test("UI is module-driven and never uses raw JSON as HTML",()=>{
 const html=readFileSync(new URL("../public-buildings.html",import.meta.url),"utf8");
 assert.match(html,/src\/public_building_rank\.mjs/);
 assert.ok(!html.includes("innerHTML"));
 assert.match(html,/textContent/);
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
