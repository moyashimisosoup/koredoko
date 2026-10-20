/**
 * APP-023: multi-landmark distance fusion over ALREADY PUBLISHED named complexes.
 * Station walking routes and facilities can be compared in one candidate ledger.
 * This does not output coordinates for unknown homes or certified identification.
 * Source-independent primary observations, network routes and straight-line
 * calculations must remain distinguishable.
 */
import {validatePublicDataset,combinePhysicalStations} from "./public_building_rank.mjs";

const ok=n=>typeof n==="number"&&Number.isFinite(n);
const text=s=>typeof s==="string"&&s.trim().length>0;
const isObj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const hRad=Math.PI/180;
export function haversineMeters(a,b){
 if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(ok)||
    Math.abs(a.lat)>90||Math.abs(b.lat)>90||
    Math.abs(a.lon)>180||Math.abs(b.lon)>180)throw Error("Invalid geographic point");
 const la=(b.lat-a.lat)*hRad,lo=(b.lon-a.lon)*hRad;
 return Math.round(12742000*Math.asin(Math.sqrt(
    Math.sin(la/2)**2+Math.cos(a.lat*hRad)*Math.cos(b.lat*hRad)*Math.sin(lo/2)**2)));
}
export function validateFacilityRegistry(registry){
 if(registry?.schema_version!=="public-facility-registry-v0.1"||
    !Array.isArray(registry.facilities)||registry.facilities.length<1||
    registry.facilities.length>50)throw Error("Invalid public facility registry");
 const ids=new Set(),physical=new Map();
 for(const p of registry.facilities){
  if(!isObj(p)||!text(p.id)||ids.has(p.id)||
     !text(p.physical_id)||!text(p.name)||!text(p.category)||
     !ok(p.lat)||!ok(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180||
     !ok(p.coordinate_uncertainty_m)||p.coordinate_uncertainty_m<0||
     p.coordinate_uncertainty_m>3000||
     !text(p.source_kind)||!/^https:\/\//.test(p.source_url||""))
    throw Error("Invalid named facility coordinate or provenance");
  ids.add(p.id);
  const prev=physical.get(p.physical_id);
  if(prev && haversineMeters(prev,p)>5000)
    throw Error("Disagreeing aliases for the same physical facility");
  physical.set(p.physical_id,p);
 }
 return registry;
}
const gap=(value,lo,hi)=>value<lo?lo-value:value>hi?value-hi:0;
const gapBetweenIntervals=(low,high,bandLow,bandHigh)=>
 high<bandLow?bandLow-high:low>bandHigh?low-bandHigh:0;

/** Duplicates (e.g. administration desk and library inside one center) share
 * one physical landmark and may not contribute independent location votes. */
export function combineFacilityConstraints(registry,conditions){
 validateFacilityRegistry(registry);
 if(!Array.isArray(conditions)||conditions.length>20)throw Error("Invalid facility constraints");
 const byId=new Map(registry.facilities.map(x=>[x.id,x]));
 const unique=new Map();let deduplicated=0;
 for(const co of conditions){
  const p=byId.get(co?.facility_id);
  if(!p||!["straight_m","walk_m"].includes(co.metric)||
     !ok(co.min_m)||!ok(co.max_m)||co.min_m<0||co.max_m>20000||
     co.min_m>co.max_m)throw Error("Invalid distance condition or unknown facility");
  const prev=unique.get(p.physical_id);
  if(prev){
   if(prev.metric!==co.metric)throw Error("One physical facility has incompatible distance modes");
   prev.min_m=Math.min(prev.min_m,co.min_m);
   prev.max_m=Math.max(prev.max_m,co.max_m);
   prev.labels.push(co.facility_id);deduplicated++;
  }else unique.set(p.physical_id,{facility:p,metric:co.metric,
    min_m:co.min_m,max_m:co.max_m,labels:[co.facility_id]});
 }
 return {conditions:[...unique.values()],duplicate_facility_clues:deduplicated};
}
export function evaluatePublishedLocationFusion(doc,registry,adId,{
 includeStations=true,facilityConditions=[],facilityRoutes=[]
}={}){
 validatePublicDataset(doc);
 validateFacilityRegistry(registry);
 const ad=doc.advertisements.find(x=>x.id===adId);
 if(!ad)throw Error("Unknown public advertisement");
 const stations=includeStations?combinePhysicalStations(ad.conditions):{stations:[],duplicate_line_constraints:0};
 const fac=combineFacilityConstraints(registry,facilityConditions);
 if(!stations.stations.length&&!fac.conditions.length)throw Error("Select a station or public facility distance condition");
 if(!Array.isArray(facilityRoutes)||facilityRoutes.length>2000)throw Error("Invalid facility route list");
 const publicIds=new Set(doc.candidates.map(x=>x.id));
 const facIds=new Set(registry.facilities.map(x=>x.id));
 const facPhysical=new Map(registry.facilities.map(x=>[x.id,x.physical_id]));
 const routeIndex=new Map();
 for(const obs of facilityRoutes){
  if(!isObj(obs)||!publicIds.has(obs.candidate_id)||!facIds.has(obs.facility_id)||
     !ok(obs.meters)||obs.meters<=0||obs.meters>25000||
     !text(obs.source_url)||!/^https:\/\//.test(obs.source_url)||
     obs.mode!=="pedestrian_observed"||
     !ok(obs.snap_start_m)||!ok(obs.snap_end_m)||
     obs.snap_start_m<0||obs.snap_end_m<0)
    throw Error("Invalid documented pedestrian facility route");
  const key=obs.candidate_id+"|"+facPhysical.get(obs.facility_id);
  if(routeIndex.has(key))throw Error("Duplicate observed facility route");
  routeIndex.set(key,obs);
 }
 const descriptors=[
  ...stations.stations.map(s=>({key:"station:"+s.place_id,label:s.labels.join(" / "),group_id:"station:"+s.place_id,kind:"station_walk",condition:s})),
  ...fac.conditions.map(c=>({key:"facility:"+c.facility.physical_id,label:c.facility.name,group_id:c.facility.physical_id,kind:c.metric,condition:c}))
 ];
 const rows=doc.candidates.map(candidate=>{
  const originUncertainty=60; // exploratory planning tolerance, NOT a statistical bound
  let totalGap=0,missing=0,review=0;
  const evidence=descriptors.map(x=>{
   if(x.kind==="station_walk"){
    const s=x.condition,obs=candidate.distances.find(d=>d.place_id===s.place_id);
    const low=(s.min_minutes-1)*80,high=s.max_minutes*80;
    if(!obs){missing++;return {key:x.key,label:x.label,metric:"walking_route",source:"missing",status:"route_missing",scored:false,gap_m:null};}
    const score=gap(obs.meters,low,high);
    const warning=obs.snap_start_m>25||obs.snap_end_m>25;
    if(warning)review++;
    totalGap+=score;
    return {key:x.key,label:x.label,metric:"walking_route",source:"Valhalla public pedestrian route to STATION REPRESENTATIVE",observed_m:obs.meters,
      expected_band_m:[low,high],gap_m:Math.round(score),scored:true,
      status:score===0?"reference_band_overlap":"reference_band_differs",
      quality_warning:warning?"endpoint_snap_review":"station_exit_unverified",can_confirm:false};
   }
   const f=x.condition.facility,{min_m,max_m}=x.condition;
   const representativeM=haversineMeters(candidate,f);
   const margin=originUncertainty+f.coordinate_uncertainty_m;
   const straightRange=[Math.max(0,representativeM-margin),representativeM+margin];
   if(x.kind==="straight_m"){
    const score=Math.round(gapBetweenIntervals(...straightRange,min_m,max_m));
    totalGap+=score;
    return {key:x.key,label:x.label,metric:"straight_distance",source:f.source_kind,
      source_url:f.source_url,observed_m:representativeM,
      estimated_range_m:straightRange,expected_band_m:[min_m,max_m],
      gap_m:score,scored:true,status:score===0?"possible_reference_overlap":"reference_range_differs",
      quality_warning:"approximate_facility_and_building_points",can_confirm:false};
   }
   const route=routeIndex.get(candidate.id+"|"+f.physical_id);
   if(!route){
    missing++;const tension=straightRange[0]>max_m;
    return {key:x.key,label:x.label,metric:"walking_route",source:"not_measured",
      air_distance_reference_m:representativeM,estimated_air_range_m:straightRange,
      expected_band_m:[min_m,max_m],gap_m:null,scored:false,
      status:tension?"air_lower_bound_exceeds_requested_walk_cap":"pedestrian_route_missing",
      quality_warning:"straight_distance_is_not_walking_distance",can_confirm:false};
   }
   const m=route.meters,score=gap(m,min_m,max_m);
   totalGap+=score;
   const warning=route.snap_start_m>25||route.snap_end_m>25;
   if(warning)review++;
   return {key:x.key,label:x.label,metric:"walking_route",source:route.source_url,
     observed_m:m,expected_band_m:[min_m,max_m],gap_m:Math.round(score),
     scored:true,status:score===0?"reference_band_overlap":"reference_band_differs",
     quality_warning:warning?"endpoint_snap_review":"facility_access_point_unverified",can_confirm:false};
  });
  return {candidate_id:candidate.id,name:candidate.label,public_source_url:candidate.source_url,
    evidence,checked_conditions:evidence.length-missing,total_conditions:evidence.length,
    missing_conditions:missing,observed_gap_total_m:Math.round(totalGap),
    reference_band_compatible:missing===0&&evidence.every(e=>e.gap_m===0),
    quality_flags_count:review,identity_verified:false,location_probability:null};
 });
 rows.sort((a,b)=>a.missing_conditions-b.missing_conditions ||
   a.observed_gap_total_m-b.observed_gap_total_m||
   a.candidate_id.localeCompare(b.candidate_id));
 const steps=[];let survivors=new Set(doc.candidates.map(x=>x.id));
 for(const desc of descriptors){
  // Never discard a candidate only because walking-route data is absent.
  const before=survivors.size;
  for(const row of rows){
   const e=row.evidence.find(x=>x.key===desc.key);
   if(e?.scored&&e.gap_m>0)survivors.delete(row.candidate_id);
  }
  steps.push({condition:desc.label,kind:desc.kind,remaining_reference_compatible:survivors.size,
    compared_to_previous:before,dropped:before-survivors.size});
 }
 const complete=rows.every(r=>r.missing_conditions===0);
 return {advertisement_id:adId,candidate_count:rows.length,
   evidence_conditions:descriptors.length,independent_physical_clues:descriptors.length,
   duplicate_station_clues:stations.duplicate_line_constraints,
   duplicate_facility_clues:fac.duplicate_facility_clues,
   reference_compatible_candidates:rows.filter(x=>x.reference_band_compatible).map(x=>x.candidate_id),
   narrowing_steps:steps,
   fully_observed_across_candidates:complete,
   ranked:rows,
   result_state:complete?"public_reference_comparison_only":"incomplete_reference_distances",
   can_identify_private_home:false,confirmed_identity:false,statistical_accuracy:null,
   disclaimer:"Only already-published named public complexes; station exits and facility entrances NOT independently surveyed. The assumed location uncertainty is not calibrated."};
}
