/** APP-023 / Hibarigaoka: render P1→P2 conditions and independently
 * attributed public ADDRESS-NUMBER references in the SAME region.
 * A geocoder's address-number reference IS NOT a building or facility entrance.
 * This module cannot produce a pedestrian ranking, identify an ad's answer,
 * infer missing parks or copy answer-key building names into ad features.
 */
import {auditHibariV2NumberReferences} from "./hibari_v2_number_quality.mjs";
import {compareBridgeAgainstPublicCandidates} from "./ad_input_bridge.mjs";
import {projectPublicReferencePoints} from "./oshima_reference_map_view.mjs";
import {buildHibariExploratoryOrder} from "./hibari_partial_evidence_ranking.mjs";
const validString=x=>typeof x==="string"&&x.length>0;
const keyFacility=id=>"facility:"+id;
const referenceIdForPlace=id=>id==="station:seibu-hibarigaoka"?id:keyFacility(id);
function targetFor(publicId,buildings,pois){
 if(publicId.startsWith("building:")){
  const c=buildings.buildings.find(x=>"building:"+x.candidate_id===publicId);
  if(!c)return null;
  return {id:c.candidate_id,label:"公開住宅 "+c.candidate_id,type:"public_complex_reference",
    source_url:null,point_precision:"public_address_number_not_entrance",
    category:"published_named_apartment_reference",source_role:"candidate_registry_not_ad_feature"};
 }
 if(publicId==="station:seibu-hibarigaoka"){
  return {id:publicId,label:buildings.station.name,type:"station_reference",
    source_url:buildings.station.source_url,point_precision:"public_address_number_not_station_exit",
    category:"public_station",source_role:"registered_station_reference"};
 }
 const x=pois.facilities.find(f=>keyFacility(f.physical_id)===publicId);
 if(!x)return null;
 return {id:publicId,label:x.official_name,type:"facility_reference",
   source_url:x.source_url,point_precision:"public_address_number_not_facility_entrance",
   category:x.category,source_role:"official_named_poi_reference"};
}
export function buildHibariSameRegionMapReview(bridge,refs,buildings,pois,towns){
 if(bridge?.schema_version!=="app023-ad-conditions-bridge-v0.1"||
    bridge.scope!=="public_named_apartment_buildings_only"||
    bridge.source?.ground_truth_available_to_matcher!==false||
    !Array.isArray(bridge.conditions)||bridge.conditions.length>40||
    bridge.safe_for_independent_accuracy!==false||
    buildings?.cohort_id!=="hibarigaoka-20261021"||
    refs?.cohort_id!==buildings.cohort_id||
    towns?.schema_version!=="app023-town-chome-reference-snapshot-v0.1"||
    towns.cohort_id!==buildings.cohort_id||towns.records?.length!==8)
   throw Error("Incorrect or mixed-region ad input");
 const audit=auditHibariV2NumberReferences(refs,buildings,pois);
 const p2=compareBridgeAgainstPublicCandidates(bridge,buildings);
 const knownPlaceIds=new Set(pois.facilities.map(f=>f.physical_id));
 knownPlaceIds.add("station:seibu-hibarigaoka");
 if(bridge.conditions.some(c=>c.kind!=="walk"||!knownPlaceIds.has(c.place_id)||
    !Number.isInteger(c.min_minutes)||c.min_minutes<=0||
    c.min_minutes!==c.max_minutes||c.route_observed!==false||c.entrance_verified!==false))
    throw Error("Unregistered place or scoreable condition not allowed");
 const targetIds=new Set(audit.rows.map(x=>x.target_id));
 if(audit.address_targets!==18||audit.number_matched_targets!==13||
    new Set(buildings.buildings.map(b=>b.candidate_id)).size!==7||
    audit.rows.some(r=>!targetIds.has(r.target_id)))
    throw Error("Reference dataset does not match fixed public cohort");
 const digits={"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10};
 const normalizeTown=x=>x.normalize("NFKC").replace(/([一二三四五六七八九十])丁目/g,(_,n)=>digits[n]+"丁目");
 const townIndex=new Map(towns.records.map(x=>[normalizeTown(x.town),x]));
 const rows=refs.references.map(r=>{
  const t=targetFor(r.target_id,buildings,pois);
  if(!t)throw Error("Point outside registered public cohort");
  const precise=r.status==="address_number_unique"?r.point:null;
  const fallback=precise?null:townIndex.get(normalizeTown(r.normalized_town));
  if(!precise&&!fallback)throw Error("No public town reference for missing address number");
  const quality=precise?"address_number_reference_only":"town_chome_reference_only";
  const coordinates=precise?{lat:precise.latitude,lon:precise.longitude}:
   {lat:fallback.lat,lon:fallback.lon};
  return {...t,source_target_id:r.target_id,coordinates,quality,
   point_status:quality,original_address_number_status:r.status,
   point_precision:quality,route_measured:false,entrance_verified:false,
   source_updated_at:refs.source_meta_updated_utc};
 });
 const pointRows=rows.filter(x=>x.coordinates!==null);
 const mapPoints=projectPublicReferencePoints(pointRows.map(p=>({
   id:p.id,label:p.label,type:p.type,lat:p.coordinates.lat,lon:p.coordinates.lon,
   point_precision:p.point_precision,public_source_url:p.source_url
 })),{region:"hibarigaoka"});
 const coordIds=new Set(mapPoints.map(x=>x.id));
 const conditions=bridge.conditions.map(c=>{
  const targetId=referenceIdForPlace(c.place_id);
  const target=rows.find(p=>p.source_target_id===targetId);
  if(!target)throw Error("Unregistered advertised facility");
  return {id:c.id,place_id:c.place_id,label:c.label,
    advertised_walk_minutes:c.min_minutes,
    claimed_approx_m:c.claimed_approx_m,
    source_quote:c.advertised_excerpt,
    source_field:c.source_field,
    physical_poi_source_url:target.source_url,
    source_type:c.reference_type,
    reference_status:coordIds.has(target.id)?target.quality:"public_reference_coordinate_missing",
    observed_walking_m:null,
    entrance_verified:false,
    scoring_eligible:false};
 });
 const exploration=buildHibariExploratoryOrder(conditions,
  buildings.buildings.map(b=>({id:b.candidate_id})),
  rows.map(r=>({id:r.id,coordinates:r.coordinates,quality:r.quality})));
 const explored=new Map(exploration.candidates.map(x=>[x.candidate_id,x]));
 const candidates=buildings.buildings.map(b=>{
  const id=b.candidate_id,map=mapPoints.find(p=>p.id===id),e=explored.get(id);
  if(!e)throw Error("Exploration lost public candidate");
  return {id,label:"公開住宅 "+id,map_point_id:map?.id??null,
   public_reference_visible:Boolean(map),
   reference_quality:rows.find(x=>x.id===id)?.quality??"missing",
   actual_entrance_verified:false,walk_route_scoring_eligible:false,
   comparison_status:e.presentation_status,
   exploratory_order:e.reference_order,
   scenario_best_rank:e.scenario_best_rank,scenario_worst_rank:e.scenario_worst_rank,
   comparable_clue_count:e.available_clues,high_resolution_clue_count:e.quality_counts.address_number_clues,
   missing_comparison_clue_count:e.quality_counts.uncomputable_clues};
 });
 return {
  schema_version:"app023-same-region-condition-map-v0.1",
  cohort_id:buildings.cohort_id,
  origin_advertisement_id:bridge.source.advertisement_id??null,
  input_quality:bridge.source.source_quality,
  source_kind:bridge.source.origin,
  source_updated_at:refs.source_meta_updated_utc,
  source_attribution:"Geolonia Japanese Addresses v2, CC BY 4.0; Digital Agency address base registry derived",
  map_kind:"relative_geographic_reference_scatter_not_street_map",
  map_is_not_verified_entrances:true,
  input_condition_count:conditions.length,
  withheld_condition_count:bridge.withheld.length,
  withheld_conditions:bridge.withheld.map(x=>({...x})),
  conditions,
  target_reference_count:rows.length,
  coordinate_reference_count:rows.filter(x=>x.quality==="address_number_reference_only").length,
  lower_precision_town_reference_count:rows.filter(x=>x.quality==="town_chome_reference_only").length,
  missing_target_references:rows.filter(x=>x.quality==="town_chome_reference_only").map(x=>({
    id:x.id,label:x.label,type:x.type,reason:x.original_address_number_status,
    safe_fallback:"town_chome_reference_only_not_address_number"
  })),
  map_points:mapPoints,
  available_public_buildings:candidates.length,
  candidates,
  exploratory_order:exploration,
  physical_pois_on_map:rows.filter(x=>x.type==="facility_reference"&&x.coordinates).length,
  recorded_pedestrian_comparison_pairs:0,
  unverified_reference_pilot_pairs:2,
  scoring_eligible_pairs:0,
  ranking_state:p2.comparison?.ranking_state??"abstain",
  user_facing_candidate_state:exploration.used_model_for_candidates?"preliminary_comparison_not_exclusion":"all_candidates_retained_no_valid_ad_clues",
  candidate_ids_not_excluded:candidates.map(x=>x.id),
  ground_truth_attached:false,
  independent_accuracy:null,
  note:"All seven candidates remain. Five missing exact address-number points use openly labeled coarse town references. Scenario orders are uncalibrated investigation priorities, NOT validated pedestrian rankings."
 };
}