import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditPublicCandidateQuality,reviewRouteEvidence}
 from "../src/evidence_quality_gate.mjs";

const data=()=>JSON.parse(readFileSync(new URL("../examples/kamata_public_4complex_12routes_20261020.json",import.meta.url),"utf8"));
const structures=()=>JSON.parse(readFileSync(new URL("../examples/kamata_public_structures_20261020.json",import.meta.url),"utf8"));
const record=()=>({
 meters:490,air_m:355,snap_start_m:5,snap_end_m:3,
 quality_provenance:{
  origin_role:"published_complex_entrance",
  origin_source_url:"https://example.org/independent-survey/entrance-A",
  origin_surveyed_independently:true,
  destination_role:"station_exit",
  destination_source_url:"https://another.example.org/survey/exit-A",
  destination_surveyed_independently:true,
  routing_graph_revision:"network-2026-10-frozen",
  graph_source_url:"https://network.example.org/graph/revision",
  routing_profile:"pedestrian",
  routing_source_class:"independent_pedestrian_network",
  measured_at:"2026-10-20"
 }});

test("existing 4 public buildings lack independently verified station exit routes",()=>{
 const report=auditPublicCandidateQuality(data(),structures(),"AD-K1",{useStructure:true});
 assert.equal(report.candidate_count,4);
 assert.equal(report.destination_count,2);
 assert.equal(report.route_checks_total,8);
 assert.equal(report.verified_route_evidence_count,0);
 assert.equal(report.gate,"withhold_identity_decision");
 assert.equal(report.independently_verified_identification,false);
 assert.equal(report.safe_to_eliminate_candidates,false);
 assert.equal(report.estimated_accuracy,null);
});
test("existing 12 observed walking measurements all retain unverified provenance",()=>{
 const d=data();let n=0;
 for(const c of d.candidates)for(const distance of c.distances){
  const quality=reviewRouteEvidence(distance,{id:distance.place_id});
  assert.equal(quality.quality_checked,false);
  assert.equal(quality.status,"needs_evidence");
  assert.ok(quality.issues.includes("route_provenance_missing"));
  n++;
 }
 assert.equal(n,12);
});
test("known 37m and 54m origin snaps generate quality flags",()=>{
 const d=data();
 const flags=d.candidates.map(c=>({
  id:c.id,
  bad:c.distances.filter(x=>reviewRouteEvidence(x,{id:x.place_id})
    .issues.includes("endpoint_snap_exceeds_review_limit")).length
 }));
 assert.deepEqual(flags.map(x=>x.bad),[3,3,0,0]);
});
test("missing routes are unusable instead of scored as zero",()=>{
 const result=reviewRouteEvidence(undefined,{id:"jr-kamata"});
 assert.equal(result.status,"unusable");
 assert.ok(result.issues.includes("distance_missing_or_invalid"));
});
test("bad route snap is not promoted even with external provenance claims",()=>{
 const route=record();route.snap_end_m=90;
 const r=reviewRouteEvidence(route,{id:"jr-kamata"});
 assert.equal(r.quality_checked,false);
 assert.ok(r.issues.includes("endpoint_snap_exceeds_review_limit"));
});
test("negative or absent snap remains unknown",()=>{
 const route=record();delete route.snap_start_m;
 const r=reviewRouteEvidence(route,{id:"jr-kamata"});
 assert.equal(r.quality_checked,false);
 assert.ok(r.issues.includes("endpoint_snap_missing"));
});
test("graph version must be pinned and pedestrian",()=>{
 const route=record();route.quality_provenance.routing_graph_revision="unknown";
 assert.ok(reviewRouteEvidence(route,{id:"jr-kamata"}).issues.includes("pedestrian_graph_provenance_not_pinned"));
 route.quality_provenance.routing_graph_revision="fixed";
 route.quality_provenance.routing_profile="driving";
 assert.ok(reviewRouteEvidence(route,{id:"jr-kamata"}).issues.includes("pedestrian_graph_provenance_not_pinned"));
});
test("identical endpoint source URL triggers shared-provenance warning",()=>{
 const route=record();
 route.quality_provenance.destination_source_url=route.quality_provenance.origin_source_url;
 const review=reviewRouteEvidence(route,{id:"jr-kamata"});
 assert.ok(review.issues.includes("endpoints_share_single_provenance"));
 assert.equal(review.quality_checked,false);
});
test("missing date and non-HTTPS source are rejected",()=>{
 const route=record();route.quality_provenance.measured_at="";
 route.quality_provenance.destination_source_url="http://unverified.example/exit";
 const r=reviewRouteEvidence(route,{id:"jr-kamata"});
 assert.ok(r.issues.includes("route_observation_date_unverified"));
 assert.ok(r.issues.includes("station_exit_not_independently_verified"));
});
test("counterfactual complete documentation only qualifies for a new independent test",()=>{
 const d=data();
 for(const c of d.candidates)for(const route of c.distances){
  const proof=record().quality_provenance;
  proof.destination_source_url="https://example.org/station-exit/"+route.place_id;
  route.quality_provenance=proof;
  route.snap_start_m=3;route.snap_end_m=4;
 }
 const audit=auditPublicCandidateQuality(d,structures(),"AD-K1",{useStructure:true});
 assert.equal(audit.route_checks_total,8);
 assert.equal(audit.verified_route_evidence_count,8);
 assert.equal(audit.gate,"ready_for_independent_test");
 assert.equal(audit.independently_verified_identification,false);
 assert.equal(audit.estimated_accuracy,null);
});
test("one missing provenanced route blocks comparison readiness",()=>{
 const d=data();
 for(const c of d.candidates)for(const route of c.distances){
  route.quality_provenance=record().quality_provenance;
  route.snap_start_m=3;route.snap_end_m=3;
 }
 delete d.candidates[0].distances[0].quality_provenance;
 const r=auditPublicCandidateQuality(d,structures(),"AD-K1");
 assert.equal(r.verified_route_evidence_count,7);
 assert.equal(r.gate,"withhold_identity_decision");
});
test("walking rank and structure rank must be distinguished on AD-K2",()=>{
 const r=auditPublicCandidateQuality(data(),structures(),"AD-K2",{useStructure:true});
 assert.equal(r.walking_nominal_first,"ur-kamata-ekimae");
 assert.equal(r.structure_nominal_first,"ur-kamata-honcho");
 assert.equal(r.comparison_rank_changed_by_structure,true);
 assert.equal(r.same_primary_source_for_structure,true);
 assert.equal(r.gate,"withhold_identity_decision");
});
test("without structure ranking, no false claim of independent structure corroboration",()=>{
 const r=auditPublicCandidateQuality(data(),structures(),"AD-K2",{useStructure:false});
 assert.equal(r.walking_nominal_first,r.structure_nominal_first);
 assert.equal(r.same_primary_source_for_structure,true);
});
test("unknown station never counts as quality checked",()=>{
 const r=reviewRouteEvidence(record(),null);
 assert.ok(r.issues.includes("physical_destination_unresolved"));
 assert.equal(r.quality_checked,false);
});
test("source provenance claims by themselves do not verify identity",()=>{
 const q=reviewRouteEvidence(record(),{id:"jr-kamata"});
 assert.equal(q.quality_checked,true);
 assert.equal(q.geolocation_verified,false);
});
test("UI reveals quality flags and does not treat sample order as identified building",()=>{
 const html=readFileSync(new URL("../public-buildings.html",import.meta.url),"utf8");
 assert.ok(html.includes("evidence_quality_gate.mjs"));
 assert.ok(html.includes('id="qualityStatus"'));
 assert.ok(html.includes("withhold_identity_decision"));
 assert.equal(html.includes("innerHTML"),false);
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js.replace(/^import .*? from "[^"]+";\s*$/gm,"")));
});
test("same provider metadata cannot make new independently verified answer",()=>{
 const r=auditPublicCandidateQuality(data(),structures(),"AD-K1",{useStructure:true});
 assert.equal(r.same_primary_source_for_structure,true);
 assert.equal(r.independently_verified_identification,false);
});


test("official Akabane network manifest distinguishes catalog discovery from data import",()=>{
 const manifest=JSON.parse(readFileSync(new URL(
   "../examples/akabane_official_network_manifest_20261020.json",import.meta.url),"utf8"));
 assert.equal(manifest.publisher,"国土交通省");
 assert.equal(manifest.area,"赤羽駅周辺");
 assert.equal(manifest.dataset_updated_on,"2026-03-19");
 assert.equal(manifest.resources.length,4);
 assert.equal(manifest.ready_for_route_qa,false);
 assert.equal(manifest.network_structure_reviewed,false);
 assert.equal(manifest.station_exit_coordinates_reviewed,false);
 assert.equal(manifest.building_entrances_reviewed,false);
 for(const row of manifest.resources){
  assert.match(row.url,/^https:\/\/ckan\.hokonavi\.go\.jp/);
  assert.ok(row.size_bytes>0);
  assert.ok(["nodes","links"].includes(row.role));
 }
});
