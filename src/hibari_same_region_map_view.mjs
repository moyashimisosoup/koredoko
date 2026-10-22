/** APP-023 / Hibarigaoka: render P1→P2 conditions and independently
 * attributed public ADDRESS-NUMBER references in the SAME region.
 * A geocoder's address-number reference IS NOT a building or facility entrance.
 * This module cannot produce a pedestrian ranking, identify an ad's answer,
 * infer missing parks or copy answer-key building names into ad features.
 */
import {auditHibariV2NumberReferences} from "./hibari_v2_number_quality.mjs";
import {compareBridgeAgainstPublicCandidates} from "./ad_input_bridge.mjs";
import {projectPublicReferencePoints} from "./oshima_reference_map_view.mjs";
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
export function buildHibariSameRegionMapReview(bridge,refs,buildings,pois){
 if(bridge?.schema_version!=="app023-ad-conditions-bridge-v0.1"||
    bridge.scope!=="public_named_apartment_buildings_only"||
    bridge.source?.ground_truth_available_to_matcher!==false||
    !Array.isArray(bridge.conditions)||bridge.conditions.length>40||
    bridge.safe_for_independent_accuracy!==false||
    buildings?.cohort_id!=="hibarigaoka-20261021"||
    refs?.cohort_id!==buildings.cohort_id)
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
 const rows=refs.references.map(r=>{
   const t=targetFor(r.target_id,buildings,pois);
   if(!t)throw Error("Point outside registered public cohort");
   const point=r.status==="address_number_unique"?r.point:null;
   const pointStatus=point?"address_number_reference_only":r.status;
   return {...t,source_target_id:r.target_id,
     coordinates:point?{lat:point.latitude,lon:point.longitude}:null,
     point_status:pointStatus,
     route_measured:false,entrance_verified:false,
     can_be_ranked:false,
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
    source_quote:c.advertised_excerpt,
    source_field:c.source_field,
    physical_poi_source_url:target.source_url,
    source_type:c.reference_type,
    reference_status:coordIds.has(target.id)?"address_number_reference_only":"public_reference_coordinate_missing",
    observed_walking_m:null,
    entrance_verified:false,
    scoring_eligible:false};
 });
 const candidates=buildings.buildings.map(b=>{
  const id=b.candidate_id,map=mapPoints.find(p=>p.id===id);
  return {id,label:"公開住宅 "+id,map_point_id:map?.id??null,
    public_reference_visible:Boolean(map),
    reference_quality:map?"address_number_reference_only":"public_reference_coordinate_missing",
    actual_entrance_verified:false,walk_route_scoring_eligible:false,
    comparison_status:"not_ranked_missing_validated_walking_routes"};
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
  coordinate_reference_count:mapPoints.length,
  missing_target_references:rows.filter(x=>x.coordinates===null).map(x=>({
    id:x.id,label:x.label,type:x.type,reason:x.point_status
  })),
  map_points:mapPoints,
  available_public_buildings:candidates.length,
  candidates,
  physical_pois_on_map:rows.filter(x=>x.type==="facility_reference"&&x.coordinates).length,
  recorded_pedestrian_comparison_pairs:0,
  unverified_reference_pilot_pairs:2,
  scoring_eligible_pairs:0,
  ranking_state:p2.comparison?.ranking_state??"abstain",
  candidate_ids_not_excluded:candidates.map(x=>x.id),
  ground_truth_attached:false,
  independent_accuracy:null,
  note:"The station and POIs are in the same geographic cohort as H01-H07. Missing parks/building K01 are not interpolated. Two separately recorded pilot routes are reference-only, cannot score."
 };
}