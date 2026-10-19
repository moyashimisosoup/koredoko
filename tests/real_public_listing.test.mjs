import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewInput} from "../src/input_review.mjs";
import {screenStationCandidate,exploratoryStationDiskCheck} from "../src/poi_station_review.mjs";

const load = p => JSON.parse(readFileSync(new URL("../examples/"+p,import.meta.url),"utf8"));
const listing = () => load("real_ur_kamata_listing_v0.2.json");
const poi = () => load("real_kamata_openpoi_review_20261019.json");

const officialExcerpts = [
  "JR京浜東北線ほか｢蒲田｣駅 徒歩5分",
  "京急本線｢京急蒲田｣駅 徒歩10分",
  "構造  | 鉄骨鉄筋コンクリート造",
  "間取り/床面積  | 3DK/59㎡～61㎡"
].join("\n");

test("UR public listing can pass input basic checks with exact excerpts",()=>{
 const report=reviewInput(JSON.stringify(listing()),officialExcerpts);
 assert.equal(report.valid,true,report.errors.join(", "));
 assert.deepEqual(report.errors,[]);
});
test("AI-assisted extraction method remains explicit in provenance",()=>{
 assert.equal(listing().sources[0].method,"ai_json");
});
test("missing advertising source content cannot be mistaken for full validation",()=>{
 const report=reviewInput(JSON.stringify(listing()));
 assert.equal(report.valid,true);
 assert.ok(report.warnings.some(x=>x.includes("未確認")));
});
test("missing original quote is rejected",()=>{
 const original=officialExcerpts.replace("京急本線｢京急蒲田｣駅 徒歩10分","");
 const report=reviewInput(JSON.stringify(listing()),original);
 assert.equal(report.valid,false);
 assert.ok(report.errors.some(x=>x.includes("引用")));
});
test("advertising administration age must not be guessed into build year",()=>{
 const data=listing().listing;
 assert.equal(data.built_year,null);
 assert.equal(data.unit_floor,null);
});
test("advertised area range is not silently cast to a numeric apartment area",()=>{
 assert.equal(listing().listing.area_sqm,null);
});
test("evidence from a single official ad uses one dependency group",()=>{
 assert.equal(new Set(listing().evidence.map(x=>x.dependency_group)).size,1);
});
test("two exact station candidate records pass only as candidate not verified exit",()=>{
 const rows=poi().results;
 for(const q of ["蒲田駅","京急蒲田駅"]){
   const candidate=rows.find(x=>x.name===q);
   const found=screenStationCandidate(candidate,q,"大田区");
   assert.equal(found.status,"station_candidate");
   assert.ok(found.reasons.includes("exit_location_not_verified"));
 }
});
test("similar POI in wrong municipality is rejected",()=>{
 const x=poi().results.find(x=>x.city==="江東区");
 assert.equal(screenStationCandidate(x,"京急蒲田駅","大田区").status,"reject");
});
test("similarly named station with false municipality is rejected",()=>{
 const x=poi().results.find(x=>x.city==="横浜市旭区");
 const v=screenStationCandidate(x,"蒲田駅","大田区");
 assert.equal(v.status,"reject");
 assert.ok(v.reasons.includes("municipality_mismatch"));
});
test("bogus POI coordinates are rejected",()=>{
 const x={...poi().results[0],lat:999};
 assert.equal(screenStationCandidate(x,"蒲田駅","大田区").status,"reject");
});
test("a non-N02 matching station remains review-only",()=>{
 const x={...poi().results[0],source:"overture"};
 assert.equal(screenStationCandidate(x,"蒲田駅","大田区").status,"review");
});
test("two representative stations allow only preliminary overlap diagnostic",()=>{
 const [a,b]=poi().results;
 const d=exploratoryStationDiskCheck(a,b,5,10);
 assert.ok(d.station_direct_distance_m>=800 && d.station_direct_distance_m<815);
 assert.equal(d.sum_walk_upper_bounds_m,1200);
 assert.equal(d.nominal_upper_disks_overlap,true);
 assert.equal(d.gate,"exploratory_only_unverified_exits");
});
test("range walk times require separate representation rather than forced conversion",()=>{
 const o=listing();o.listing.stations[0].walk_minutes="7～11";
 assert.equal(reviewInput(JSON.stringify(o)).valid,false);
});
test("multi-modal travel cannot be validated as a pure walking constraint",()=>{
 const o=listing();o.listing.stations[0].travel_mode="bus_plus_walk";
 const r=reviewInput(JSON.stringify(o),officialExcerpts);
 assert.ok(r.warnings.some(x=>x.includes("徒歩距離")));
});
test("a station name is not treated as a physical entrance",()=>{
 const x=poi().results[0];
 const r=screenStationCandidate(x,"蒲田駅","大田区");
 assert.notEqual(r.status,"verified");
});
