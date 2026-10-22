/**
 * APP-023: show actual, already-published Ojima reference points next to
 * the existing multi-facility comparison. NEVER draw unrecorded walking paths,
 * turn illustrative facility thresholds into advertising facts or rank homes.
 */
import {evaluatePublishedLocationFusion} from "./facility_distance_fusion.mjs";

const num=v=>typeof v==="number"&&Number.isFinite(v);
const str=v=>typeof v==="string"&&v.trim().length>0;
const types=new Set(["public_complex_reference","station_reference","facility_reference"]);
const LIMITS={minLat:35.65,maxLat:35.75,minLon:139.78,maxLon:139.89};
const allowed=p=>p&&num(p.lat)&&num(p.lon)&&p.lat>=LIMITS.minLat&&p.lat<=LIMITS.maxLat&&p.lon>=LIMITS.minLon&&p.lon<=LIMITS.maxLon;
const meterLimit=n=>num(n)&&n>=0&&n<=20000;
/** Plain coordinate reference scatter projection (not surveyed property
 * boundaries, OSM road geometries, exit locations or a licensed tile map). */
export function projectPublicReferencePoints(points){
 if(!Array.isArray(points)||points.length<2||points.length>100||
    points.some(p=>!allowed(p)||!str(p.id)||!str(p.label)||!types.has(p.type))||
    new Set(points.map(p=>p.id)).size!==points.length)throw Error("Invalid public reference points");
 const center=points.reduce((sum,p)=>sum+p.lat,0)/points.length;
 const longitudeFactor=Math.cos(center*Math.PI/180);
 const lons=points.map(p=>p.lon*longitudeFactor),lats=points.map(p=>p.lat);
 const minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...lats),maxY=Math.max(...lats);
 const spreadX=Math.max(maxX-minX,0.0015),spreadY=Math.max(maxY-minY,0.0015);
 const margin=0.09;
 return points.map(p=>({
  id:p.id,label:p.label,type:p.type,
  lat:p.lat,lon:p.lon,
  xPct:Math.round((margin+(p.lon*longitudeFactor-minX)/spreadX*(1-2*margin))*1000)/10,
  yPct:Math.round((margin+(maxY-p.lat)/spreadY*(1-2*margin))*1000)/10,
  point_precision:p.point_precision??"public_reference_not_entrance",
  public_source_url:p.public_source_url??null
 }));
}
export function buildOjimaPublicMapReview(doc,registry,routes,advertisementId,{
 facilityId=null,metric="walk_m",minMeters=0,maxMeters=500
}={}){
 if(doc?.schema_version!=="public-complex-crosscheck-v0.1"||
    !Array.isArray(doc.candidates)||doc.candidates.length!==5||
    !Array.isArray(doc.stations)||doc.stations.length!==4||
    registry?.schema_version!=="public-facility-registry-v0.1"||
    !Array.isArray(registry.facilities)||registry.facilities.length!==3||
    routes?.schema_version!=="public-facility-pedestrian-observations-v0.1"||
    !Array.isArray(routes.observations)||
    !["walk_m","straight_m"].includes(metric)||!meterLimit(minMeters)||
    !meterLimit(maxMeters)||minMeters>maxMeters)
  throw Error("Unexpected public map cohort, measure or facility constraints");
 const selected=facilityId===null?null:registry.facilities.find(f=>f.id===facilityId);
 if(facilityId!==null&&!selected)throw Error("Unknown public facility");
 const stationOnly=evaluatePublishedLocationFusion(doc,registry,advertisementId,{
  includeStations:true,facilityConditions:[],facilityRoutes:routes.observations
 });
 const additional=selected?[{facility_id:selected.id,metric,min_m:minMeters,max_m:maxMeters}]:[];
 const combined=selected?evaluatePublishedLocationFusion(doc,registry,advertisementId,{
  includeStations:true,facilityConditions:additional,facilityRoutes:routes.observations
 }):stationOnly;
 const points=[
  ...doc.candidates.map(c=>({id:c.id,label:c.label,type:"public_complex_reference",
    lat:c.lat,lon:c.lon,point_precision:c.geocode_precision,public_source_url:c.source_url})),
  ...doc.stations.map(s=>({id:"station:"+s.id,label:s.name,type:"station_reference",
    lat:s.lat,lon:s.lon,point_precision:"public_station_representative_not_exit"})),
  ...registry.facilities.map(f=>({id:"facility:"+f.id,label:f.name,type:"facility_reference",
    lat:f.lat,lon:f.lon,point_precision:f.source_kind,public_source_url:f.source_url}))
 ];
 const projected=projectPublicReferencePoints(points);
 const stationResult=stationOnly.reference_compatible_candidates;
 const combinedResult=combined.reference_compatible_candidates;
 const output=combined.ranked.map(c=>{
  const station=stationOnly.ranked.find(b=>b.candidate_id===c.candidate_id);
  const point=projected.find(p=>p.id===c.candidate_id);
  if(!station||!point)throw Error("Unregistered mapped public candidate");
  const observed=selected?routes.observations.find(r=>r.candidate_id===c.candidate_id&&r.facility_id===selected.id):null;
  const facilityEvidence=selected?c.evidence.find(e=>e.key==="facility:"+selected.physical_id):null;
  const observedFacility=selected && metric==="walk_m"?observed:null;
  return {id:c.candidate_id,name:c.name,public_source_url:c.public_source_url,
   xPct:point.xPct,yPct:point.yPct,
   station_reference_compatible:stationResult.includes(c.candidate_id),
   combined_reference_compatible:combinedResult.includes(c.candidate_id),
   baseline_gap_m:station.observed_gap_total_m,
   combined_gap_m:c.observed_gap_total_m,
   missing_conditions:c.missing_conditions,
   route_conditions:c.total_conditions,
   facility_reference_m:facilityEvidence?.observed_m??null,
   facility_route_evidence_status:observedFacility?(observedFacility.snap_start_m>25||observedFacility.snap_end_m>25?
     "endpoint_review_required":"endpoints_unverified"):"no_verified_walking_route_claim",
   facility_observed_route_m:observedFacility?.meters??null,
   evidence:c.evidence.map(e=>({
    label:e.label,kind:e.metric,
    status:e.status,observed_m:e.observed_m??null,
    gap_m:e.gap_m??null,scored:e.scored,
    quality_warning:e.quality_warning??null,source:e.source??null,
    estimated_range_m:e.estimated_range_m??null,
    facility_public_source_url:e.source_url??null
   })),
   quality_certified:false,geographic_identity_confirmed:false};
 });
 // No broad accuracy claim, no real advertised facility condition unless its
 // explicit source is separately provided and verified (not present here).
 return {schema_version:"app023-public-relative-map-review-v0.1",
  experiment_id:doc.experiment_id,
  advertisement_id:advertisementId,
  station_condition_origin:"existing_public_ur_advertisement",
  facility_condition_origin:selected?"user_selected_hypothetical_not_an_advertisement":"not_selected",
  selected_public_facility:selected?{id:selected.id,name:selected.name,source_url:selected.source_url,category:selected.category}:null,
  selected_facility_measure:selected?metric:null,
  selected_facility_band_m:selected?[minMeters,maxMeters]:null,
  candidate_count:output.length,station_reference_routes:doc.candidates.reduce((sum,c)=>sum+c.distances.length,0),
  stored_facility_reference_routes:routes.observations.length,
  matched_facility_reference_routes:selected?routes.observations.filter(r=>r.facility_id===selected.id).length:0,
  baseline_reference_compatible_candidates:[...stationResult],
  combined_reference_compatible_candidates:[...combinedResult],
  reference_count_difference:stationResult.length-combinedResult.length,
  coordinates_are:"public_named_location_representatives_not_building_or_facility_entrances",
  drawing_is:"relative_coordinate_plot_without_map_tiles_or_walking_route_lines",
  quality_warning:"Route distances use address/station/facility references; graph revision and actual entrances are not verified. Example facility limits are user-supplied, not real ads.",
  map_points:projected,ranked:output,scoring_quality_certified:false,
  individual_private_dwellings_included:false,independent_accuracy:null};
}
