import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {indexPublicPoiIdentities,auditPublishedAdPoiReadiness} from "../src/public_ad_poi_readiness.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
const ads=()=>read("hibari_real_ads_prelocked_20261021.json");
const poi=()=>read("hibari_poi_identities_20261021.json");
const copy=x=>JSON.parse(JSON.stringify(x));

test("the seven locked ads contain exactly sixteen original landmark clues, without changing original values",()=>{
 const a=ads();
 assert.deepEqual(a.advertisements.map(x=>x.ad_id),["H01","H02","H03","H04","H05","H06","H07"]);
 assert.deepEqual(a.advertisements.map(x=>x.station.walk_minutes),[5,4,2,11,18,10,18]);
 assert.equal(a.advertisements.reduce((n,x)=>n+x.facilities.length,0),16);
 assert.equal(a.advertisements[1].facilities[2].approx_distance_m,1537);
 assert.equal(a.advertisements[1].facilities[2].walk_minutes,15);
 assert.equal(a.advertisements[1].facilities[2].usable_for_first_pass,false);
 assert.equal(a.advertisements[2].facilities[2].walk_minutes,null);
});
test("official facility identities have ten physical POIs, twelve strict names and no fake coordinates",()=>{
 const r=poi();
 const idx=indexPublicPoiIdentities(r);
 assert.equal(idx.byPhysical.size,10);
 assert.equal(idx.byAlias.size,12);
 assert.ok(r.facilities.every(x=>x.coordinate_status==="not_independently_verified"&&!("lat" in x)));
});
test("PARCO spelling variations share one public facility identity",()=>{
 const i=indexPublicPoiIdentities(poi());
 assert.equal(i.byAlias.get("ひばりが丘parco").physical_id,i.byAlias.get("parcoひばりが丘").physical_id);
});
test("all POI names are recognized but index-only sources and missing pedestrian routes remain blocked",()=>{
 const s=auditPublishedAdPoiReadiness(ads(),poi());
 assert.equal(s.public_advertisements,7);
 assert.equal(s.direct_page_ads,3);
 assert.equal(s.index_only_ads,4);
 assert.equal(s.facility_clues,16);
 assert.equal(s.preliminary_valid_clues,14);
 assert.equal(s.quarantined_clues,2);
 assert.equal(s.direct_source_preliminary_clues,6);
 assert.equal(s.official_name_matches,16);
 assert.equal(s.unique_official_pois,10);
 assert.equal(s.unique_active_physical_pois,9);
 assert.equal(s.potential_facility_candidate_pairs,63);
 assert.equal(s.potential_station_candidate_pairs,7);
 assert.equal(s.observed_new_routes,0);
 assert.equal(s.scoring_ready,false);
 assert.equal(s.independent_accuracy,null);
 assert.ok(s.rows.every(x=>x.ready_for_scoring===false&&x.blockers.includes("walking_route_not_observed")));
});
test("index-only evidence is never upgraded to verified raw advertisement by official POI confirmation",()=>{
 const s=auditPublishedAdPoiReadiness(ads(),poi());
 const h4=s.rows.filter(x=>x.advertisement_id==="H04");
 assert.equal(h4.length,2);
 assert.ok(h4.every(x=>x.source_status==="indexed_excerpt"&&x.blockers.includes("ad_source_index_only")));
});
test("unverified measurement is never used even when the named official POI resolves",()=>{
 const s=auditPublishedAdPoiReadiness(ads(),poi());
 const bad=s.rows.filter(x=>x.method_status==="quarantined");
 assert.deepEqual(bad.map(x=>x.advertisement_id),["H02","H03"]);
 assert.ok(bad.every(x=>x.physical_id!==null));
 assert.ok(bad.every(x=>x.blockers.includes("advertised_distance_or_method_quarantined")));
});
test("a missing official POI name remains unresolved without fuzzy guess",()=>{
 const a=ads();
 a.advertisements[0].facilities[0].name="それっぽい別の公園";
 const r=auditPublishedAdPoiReadiness(a,poi());
 assert.equal(r.official_name_matches,15);
 assert.equal(r.rows[0].physical_id,null);
 assert.ok(r.rows[0].blockers.includes("poi_name_not_confirmed"));
});
test("conflicting aliases cannot silently merge two different physical places",()=>{
 const r=poi();
 r.facilities[0].aliases.push("西東京市立中原小学校");
 assert.throws(()=>indexPublicPoiIdentities(r),/Conflicting POI aliases/);
});
test("name-matched POI coordinates and entrances cannot be guessed from published addresses",()=>{
 const r=poi();r.facilities[0].lat=35.7;
 assert.throws(()=>indexPublicPoiIdentities(r),/geometry must not be invented/);
});
test("no correct public building or unit address enters preflight summary",()=>{
 const report=JSON.stringify(auditPublishedAdPoiReadiness(ads(),poi()));
 assert.ok(!report.includes("C48269648"));
 assert.ok(!report.includes("グランフォーレひばりが丘"));
 assert.ok(!report.includes("谷戸町２丁目"));
 assert.ok(!report.includes("4,280万円"));
});
