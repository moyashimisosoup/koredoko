/**
 * APP-023 evidence-quality audit before treating a public-complex rank as reliable.
 *
 * Missing proof is a failure to qualify, never proof of a wrong advertisement.
 * This module neither attempts private-dwelling location inference nor outputs
 * a positive identification. All reviewed candidates must be officially public.
 */
import {comparePublicCandidates} from "./public_building_rank.mjs";
import {comparePublicStructure} from "./public_structure_compare.mjs";

const hasText=v=>typeof v==="string"&&v.trim().length>0;
const isPlain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const isReal=v=>typeof v==="number"&&Number.isFinite(v);
const isHttps=u=>hasText(u)&&/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(u);
const MAX_SNAP_M=25;
const REQUIRED_PEDESTRIAN_SOURCE="independent_pedestrian_network";

export function reviewRouteEvidence(observation, station) {
  const issues=[];
  if(!isPlain(observation)||!isReal(observation.meters)||observation.meters<=0){
    return {status:"unusable",issues:["distance_missing_or_invalid"],quality_checked:false};
  }
  if(!isPlain(station)||!hasText(station.id)){
    issues.push("physical_destination_unresolved");
  }
  if(!isReal(observation.snap_start_m)||!isReal(observation.snap_end_m)||
     observation.snap_start_m<0||observation.snap_end_m<0)issues.push("endpoint_snap_missing");
  else if(observation.snap_start_m>MAX_SNAP_M||observation.snap_end_m>MAX_SNAP_M)
    issues.push("endpoint_snap_exceeds_review_limit");
  const p=observation.quality_provenance;
  if(!isPlain(p)){issues.push("route_provenance_missing");}
  else {
    if(p.origin_role!=="published_complex_entrance" ||
       !isHttps(p.origin_source_url) ||
       p.origin_surveyed_independently!==true)issues.push("building_entrance_not_independently_verified");
    if(p.destination_role!=="station_exit" ||
       !isHttps(p.destination_source_url) ||
       p.destination_surveyed_independently!==true)issues.push("station_exit_not_independently_verified");
    if(!hasText(p.routing_graph_revision) ||
       p.routing_graph_revision==="unknown" ||
       !isHttps(p.graph_source_url) ||
       p.routing_profile!=="pedestrian" ||
       p.routing_source_class!==REQUIRED_PEDESTRIAN_SOURCE)
      issues.push("pedestrian_graph_provenance_not_pinned");
    if(!hasText(p.measured_at) ||
       !/^\d{4}-\d{2}-\d{2}$/.test(p.measured_at))
      issues.push("route_observation_date_unverified");
    if(p.origin_source_url===p.destination_source_url &&
       isHttps(p.origin_source_url))
      issues.push("endpoints_share_single_provenance");
  }
  return {
    status:issues.length?"needs_evidence":"reference_route_checkable",
    issues,quality_checked:issues.length===0,
    snap_start_m:observation.snap_start_m??null,
    snap_end_m:observation.snap_end_m??null,
    measured_m:observation.meters,
    // Even when every gate passes, the winner has not been independently scored.
    geolocation_verified:false
  };
}

export function auditPublicCandidateQuality(dataset, structureEvidence, adId, {useStructure=false,places=null}={}) {
  const walking=comparePublicCandidates(dataset,adId,places);
  const structural=structureEvidence?
    comparePublicStructure(dataset,structureEvidence,adId,{useStructure,places}):null;
  const candidateById=new Map(dataset.candidates.map(c=>[c.id,c]));
  const stationById=new Map(dataset.stations.map(s=>[s.id,s]));
  const perCandidate=walking.ranked.map(c=>{
    const src=candidateById.get(c.candidate_id);
    const checks=c.evidence.map(e=>({
      place_id:e.place_id,
      ...reviewRouteEvidence(src.distances.find(d=>d.place_id===e.place_id),
                              stationById.get(e.place_id))
    }));
    const qualifiedRoutes=checks.filter(x=>x.quality_checked).length;
    const issueIds=[...new Set(checks.flatMap(x=>x.issues))].sort();
    return {
      candidate_id:c.candidate_id,label:c.label,
      route_conditions:checks.length,qualified_routes:qualifiedRoutes,
      unqualified_routes:checks.length-qualifiedRoutes,
      quality_issue_ids:issueIds,checks,
      independent_structure_evidence:false,
      ready_for_independent_comparison:checks.length>=2 &&
        qualifiedRoutes===checks.length,
      // No known independent held-out labels, so readiness never means solved.
      identity_verified:false
    };
  });
  const allQualified=perCandidate.every(c=>c.ready_for_independent_comparison);
  const rankChanged=structural?.ranked[0]?.candidate_id!==undefined &&
    structural.ranked[0].candidate_id!==walking.ranked[0]?.candidate_id;
  const total=perCandidate.reduce((s,c)=>s+c.route_conditions,0);
  const qualified=perCandidate.reduce((s,c)=>s+c.qualified_routes,0);
  const providerIndependent=structural ? structural.independent_validation===true : false;
  return {
    advertisement_id:adId,candidate_count:perCandidate.length,
    destination_count:walking.station_condition_count,
    route_checks_total:total,verified_route_evidence_count:qualified,
    large_snap_route_count:perCandidate.reduce((s,c)=>s+
      c.checks.filter(x=>x.issues.includes("endpoint_snap_exceeds_review_limit")).length,0),
    no_certified_exit_route_count:perCandidate.reduce((s,c)=>s+
      c.checks.filter(x=>x.issues.includes("station_exit_not_independently_verified")||
      x.issues.includes("route_provenance_missing")).length,0),
    walking_nominal_first:walking.ranked[0]?.candidate_id??null,
    structure_nominal_first:structural?.ranked[0]?.candidate_id??null,
    comparison_rank_changed_by_structure:!!rankChanged,
    same_primary_source_for_structure:!!structural&&!providerIndependent,
    gate:allQualified&&perCandidate.length>=2?"ready_for_independent_test":"withhold_identity_decision",
    independently_verified_identification:false,
    safe_to_eliminate_candidates:false,
    estimated_accuracy:null,
    per_candidate:perCandidate
  };
}
