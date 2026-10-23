import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditHibariV2NumberReferences} from "../src/hibari_v2_number_quality.mjs";
const file=x=>JSON.parse(readFileSync(new URL("../examples/"+x,import.meta.url),"utf8"));
const snapshot=()=>file("hibari_geolonia_v2_address_number_20261022.json");
const buildings=()=>file("hibari_public_building_addresses_20261021.json");
const pois=()=>file("hibari_poi_identities_20261021.json");
const run=()=>auditHibariV2NumberReferences(snapshot(),buildings(),pois());
test("real v2 residence-number data uniquely matches 13 of 18 publicly named endpoints",()=>{
 const x=run();
 assert.equal(x.address_targets,18);
 assert.equal(x.number_matched_targets,13);
 assert.equal(x.number_not_found,1);
 assert.equal(x.block_only_addresses,4);
 assert.equal(x.source_updated_at,"2024-12-25T04:57:50.000Z");
 assert.equal(x.public_entrances_verified,0);
 assert.equal(x.new_pedestrian_routes_observed,0);
 assert.equal(x.independent_accuracy,null);
});
test("K01 exact-number absence remains missing; four public parks have block-only addresses",()=>{
 const x=run();
 const absent=x.rows.find(z=>z.target_id==="building:K01");
 assert.equal(absent.status,"exact_number_absent");
 assert.equal(absent.reference_point,null);
 assert.equal(x.rows.filter(z=>z.status==="address_only_block").length,4);
});
test("published detailed references differ materially from town reference points",()=>{
 const x=run();
 assert.ok(x.minimum_shift_from_town_reference_m>=10);
 assert.ok(x.maximum_shift_from_town_reference_m>=350);
 assert.ok(x.median_shift_from_town_reference_m>=100);
 const p=x.rows.find(z=>z.target_id==="building:K03");
 assert.equal(p.reference_point.latitude,35.749908039000005);
 assert.equal(p.reference_point.longitude,139.5437929);
 assert.equal(p.audited_public_entrance,false);
 assert.equal(p.route_ready,false);
});
test("two public targets in same town share town centroids but not address-number points",()=>{
 const x=run();
 const station=x.rows.find(z=>z.target_id==="station:seibu-hibarigaoka");
 const b=x.rows.find(z=>z.target_id==="building:K07");
 assert.notDeepEqual(station.reference_point,b.reference_point);
 assert.equal(station.matching_house_number,true);
 assert.equal(b.matching_house_number,true);
 assert.equal(x.any_route_scoring_authorized,false);
});
test("reject tampered house number, municipality, longitude, or source matching gate",()=>{
 for(const modify of [
  s=>{s.references[2].source_row.rsdt_num=99;},
  s=>{s.references[2].point.longitude=100;},
  s=>{s.references[2].entrance_verified=true;},
  s=>{s.source_meta_updated_unix=1700000000;},
  s=>{s.router_use_authorized=true;},
  s=>{s.references[1].requested_block=55;}
 ]){
  const s=snapshot();modify(s);
  assert.throws(()=>auditHibariV2NumberReferences(s,buildings(),pois()));
 }
});
test("source cannot surreptitiously overwrite a building public address or answer ad IDs",()=>{
 const s=snapshot(),b=buildings();
 b.buildings[0].public_building_address="東京都西東京市谷戸町2丁目1番24号";
 assert.throws(()=>auditHibariV2NumberReferences(s,b,pois()),/no longer matches/);
 const x=run();
 assert.ok(!JSON.stringify(x).includes("プレミストひばりが丘"));
 assert.ok(!JSON.stringify(x).includes("HIBARI TOWER"));
 assert.ok(!JSON.stringify(x).includes("C13265R12"));
});