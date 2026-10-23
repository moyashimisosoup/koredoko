import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditHibariTownReferenceCoverage} from "../src/hibari_town_reference_coverage.mjs";
const load=path=>JSON.parse(readFileSync(new URL("../examples/"+path,import.meta.url),"utf8"));
const source=()=>load("hibari_geolonia_town_chome_references_20261022.json");
const buildings=()=>load("hibari_public_building_addresses_20261021.json");
const pois=()=>load("hibari_poi_identities_20261021.json");
const run=()=>auditHibariTownReferenceCoverage(source(),buildings(),pois());

test("actually retrieved, source-commit-pinned Geolonia town references cover 18 public addresses in eight districts",()=>{
 const x=run();
 assert.equal(x.public_target_count,18);
 assert.equal(x.town_reference_source_count,8);
 assert.equal(x.matched_town_reference_targets,18);
 assert.equal(x.unique_referenced_towns,8);
 assert.deepEqual(x.unknown_reference_targets,[]);
 assert.equal(x.source_commit,"384a5b52472363416275ac6c3e30a678b6b1252d");
 assert.equal(x.license,"CC BY 4.0");
});
test("actual published reference coordinates are real source values but town-only",()=>{
 const x=run();
 const k03=x.rows.find(r=>r.target_id==="building:K03");
 assert.equal(k03.reference_town,"谷戸町三丁目");
 assert.equal(k03.reference_lat,35.746786);
 assert.equal(k03.reference_lon,139.544765);
 assert.equal(k03.matched_street_block,false);
 assert.equal(k03.matched_house_number,false);
 assert.equal(k03.usable_for_routing,false);
});
test("station and named public estate in same district collapse onto identical references",()=>{
 const x=run(),station=x.rows.find(r=>r.target_type==="station");
 const k07=x.rows.find(r=>r.target_id==="building:K07");
 assert.equal(station.reference_lat,k07.reference_lat);
 assert.equal(station.reference_lon,k07.reference_lon);
 assert.equal(station.entrance_verified,false);
 assert.ok(x.shared_reference_groups.some(g=>g.target_ids.includes("building:K07")&&
   g.target_ids.includes("station:seibu-hibarigaoka")));
});
test("real town-reference data cannot become an entrance route or accuracy metric",()=>{
 const x=run();
 assert.equal(x.known_public_entrances,0);
 assert.equal(x.confirmed_street_blocks,0);
 assert.equal(x.new_pedestrian_observations,0);
 assert.equal(x.routing_ready,false);
 assert.equal(x.scoring_ready,false);
 assert.equal(x.independent_accuracy,null);
 assert.ok(x.rows.every(r=>!r.usable_for_routing&&!r.usable_for_accuracy_scoring));
});
test("unknown town is a missing reference, not a fabricated nearest point",()=>{
 const b=buildings();b.buildings[0].public_building_address="東京都西東京市架空町1丁目2番3号";
 const x=auditHibariTownReferenceCoverage(source(),b,pois());
 assert.equal(x.matched_town_reference_targets,17);
 assert.deepEqual(x.unknown_reference_targets,["building:K01"]);
 assert.equal(x.rows[0].reference_lat,null);
});
test("rejects overwritten geolonia coordinate, duplicate district, upgraded route permission or missing attribution",()=>{
 for(const change of [
  s=>{s.records[0].usable_for_walking_route=true;},
  s=>{s.records.push({...s.records[0]});},
  s=>{s.license="MIT";},
  s=>{s.source_commit="not-pinned";},
  s=>{s.records[0].lat=100;}
 ]){
  const x=source();change(x);
  assert.throws(()=>auditHibariTownReferenceCoverage(x,buildings(),pois()));
 }
});
test("independent ad feature input remains unchanged by town-source coverage",()=>{
 const ad=load("hibari_real_ads_prelocked_20261021.json");
 const frozen=JSON.stringify(ad);
 run();
 assert.equal(JSON.stringify(ad),frozen);
 const x=run();
 assert.ok(!JSON.stringify(x).includes("ひばりヶ丘プラザ"));
 assert.ok(!JSON.stringify(x).includes("グランフォーレひばりが丘"));
});