/** APP-023: independent-on-disk replay of publicly recorded Valhalla
 * polyline6 geometry endpoint offsets. These are NOT independently surveyed
 * station exits, building doors or routing engine internal correlation errors.
 */
import {summarizeHibariReferenceWalkPilot} from "./hibari_v2_reference_pilot.mjs";
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const equals=(a,b,eps=1e-9)=>Math.abs(a-b)<=eps;
const rad=Math.PI/180;
export function haversineMeters(a,b){
 if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(finite))throw Error("Invalid coordinates");
 const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function decodeValhallaPolyline6(s){
 if(typeof s!=="string"||s.length<2||s.length>300000)throw Error("Invalid encoded polyline");
 const points=[];let i=0,lat=0,lon=0;
 while(i<s.length){
  const d=[];
  for(let a=0;a<2;a++){
   let acc=0,shift=0,c,steps=0;
   do{
    if(i>=s.length||steps++>6)throw Error("Incomplete polyline");
    c=s.charCodeAt(i++)-63;
    if(c<0||c>63)throw Error("Invalid polyline alphabet");
    acc+=(c&31)*2**shift;shift+=5;
   }while(c>=32);
   d.push(acc%2?-(acc+1)/2:acc/2);
  }
  lat+=d[0];lon+=d[1];
  const point={lat:lat/1e6,lon:lon/1e6};
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||point.lat>90||point.lat< -90||
    point.lon>180||point.lon< -180)throw Error("Invalid decoded point");
  points.push(point);
  if(points.length>30000)throw Error("Too many route geometry vertices");
 }
 if(points.length<2)throw Error("Polyline needs two endpoints");
 return points;
}
export function auditHibariPilotRouteShapeOffsets(geometry,pilot,source,plan){
 const summary=summarizeHibariReferenceWalkPilot(pilot,source,plan);
 if(geometry?.schema_version!=="app023-route-shape-endpoint-offsets-v0.1"||
    geometry.quality_certified_routes!==0||geometry.public_entrances_verified!==0||
    geometry.route_graph_revision!=="not_available"||
    !Array.isArray(geometry.observations)||
    geometry.observations.length!==summary.exploratory_observed_pairs)
  throw Error("Malformed or scoring-enabled geometry evidence");
 const refs=new Map(summary.evidence.map(r=>[r.candidate_id+"|"+r.destination_key,r]));
 const rows=[];const visited=new Set();
 for(const record of geometry.observations){
  const k=record.candidate_id+"|"+record.destination_key;
  if(visited.has(k)||!refs.has(k))throw Error("Duplicate or unregistered shape");
  visited.add(k);
  const ref=refs.get(k),points=decodeValhallaPolyline6(record.polyline6);
  if(record.polyline_precision!==6||record.polyline_point_count!==points.length||
     record.eligible_for_accuracy_scoring!==false||record.facility_entrance_verified!==false||
     record.station_exit_verified!==false||record.graph_version!==null||
     record.source_quality!=="polyline_endpoint_offset_not_independent_street_snap_measurement"||
     record.route_request_url!==ref.source_url||
     record.route_length_m!==ref.reported_distance_m||
     record.route_time_seconds!==ref.reported_duration_seconds||
     !equals(points[0].lat,record.geometry_first_point?.lat)||
     !equals(points[0].lon,record.geometry_first_point?.lon)||
     !equals(points.at(-1).lat,record.geometry_last_point?.lat)||
     !equals(points.at(-1).lon,record.geometry_last_point?.lon))
    throw Error("Geometry missing audited reference/metadata");
  const request=new URL(record.route_request_url);
  const q=JSON.parse(request.searchParams.get("json"));
  const origin=q.locations[0],destination=q.locations[1];
  if(!equals(origin.lat,record.input_origin_point?.lat)||
     !equals(origin.lon,record.input_origin_point?.lon)||
     !equals(destination.lat,record.input_destination_point?.lat)||
     !equals(destination.lon,record.input_destination_point?.lon))
    throw Error("Geometry endpoints do not match source request");
  const start=haversineMeters(origin,points[0]),end=haversineMeters(destination,points.at(-1));
  if(!equals(Math.round(start*100)/100,record.input_to_shape_start_offset_m,0.01)||
     !equals(Math.round(end*100)/100,record.input_to_shape_end_offset_m,0.01))
    throw Error("Disputed geometry endpoint offsets");
  rows.push({candidate_id:record.candidate_id,route_length_m:record.route_length_m,
   start_reference_to_geometry_m:Math.round(start*100)/100,
   station_reference_to_geometry_m:Math.round(end*100)/100,
   polyline_vertex_count:points.length,within_25m_of_both_reference_points:start<=25&&end<=25,
   point_kind:"street_geometry_vertex_not_surveyed_entrance",
   independently_audited_building_door:false,
   independently_audited_station_exit:false,
   scoring_eligible:false});
 }
 return {schema_version:"app023-route-geometry-offset-audit-v0.1",cohort_id:geometry.cohort_id,
  observed_route_shapes:rows.length,reference_endpoint_offsets_computed:rows.length,
  geometry_endpoint_offset_warning_count:rows.filter(x=>!x.within_25m_of_both_reference_points).length,
  official_public_entrances_verified:0,quality_certified_routes:0,independent_accuracy:null,
  note:"The vertex distances measure reference-vs-shape offsets only, not an official entrance snap or a guarantee of walking-advertisement accuracy.",
  rows};
}