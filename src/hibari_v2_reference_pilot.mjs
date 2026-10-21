/** APP-023: report unqualified pedestrian pilot observations separately from
 * preregistered, entrance-audited pedestrian route evidence. Do not merge into
 * scoring or into auditHibariRouteObservations() without manual snap audits.
 */
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const eq=(a,b)=>Math.abs(a-b)<1e-9;
export function summarizeHibariReferenceWalkPilot(pilot,source,plan){
 if(pilot?.schema_version!=="app023-exploratory-reference-walks-v0.1"||
    source?.schema_version!=="app023-geolonia-v2-address-number-references-v0.1"||
    plan?.schema_version!=="app023-route-coverage-v0.1"||
    pilot.scoring_quality_verified_routes!==0||
    pilot.independent_accuracy!==null||
    !Array.isArray(pilot.observations)||
    pilot.observations.length>plan.expected_route_pairs)
  throw Error("Invalid non-scoreable pedestrian pilot");
 const pointIndex=new Map(source.references.map(r=>[r.target_id,r.point]));
 const pairs=new Set(plan.routes.map(r=>r.candidate_id+"|"+r.destination_key));
 const seen=new Set();const evidence=[];
 for(const o of pilot.observations){
  const k=o.candidate_id+"|"+o.destination_key;
  const original=pointIndex.get("building:"+o.candidate_id);
  const destination=pointIndex.get(o.destination_key);
  if(!pairs.has(k)||seen.has(k)||!original||!destination||!o.origin_point||!o.destination_point)
    throw Error("Unregistered or duplicate pilot route");
  seen.add(k);
  if(!eq(o.origin_point.lat,original.latitude)||!eq(o.origin_point.lon,original.longitude)||
     !eq(o.destination_point.lat,destination.latitude)||!eq(o.destination_point.lon,destination.longitude)||
     !finite(o.meters)||!finite(o.route_engine_reported_length_km)||
     !finite(o.route_engine_reported_time_seconds)||
     Math.abs(o.meters-o.route_engine_reported_length_km*1000)>0.01||
     o.result_status!==0||o.status!=="exploratory_reference_route_observed_not_quality_qualified"||
     o.scoring_eligible!==false||o.street_access_or_entrance_verified!==false||
     o.endpoint_snap_start_m!==null||o.endpoint_snap_end_m!==null||
     o.routing_graph_revision!==null||o.source_url!=="https://valhalla1.openstreetmap.de/route"||
     !o.request_url?.startsWith("https://valhalla1.openstreetmap.de/route?json="))
    throw Error("Pilot missing honest routing provenance or endpoint quality status");
  const raw=o.request_url.slice(o.request_url.indexOf("?json=")+6);
  let request;
  try{request=JSON.parse(decodeURIComponent(raw));}catch{throw Error("Invalid saved route request");}
  if(request.costing!=="pedestrian"||request.locations?.length!==2||
     !eq(request.locations[0].lat,original.latitude)||!eq(request.locations[0].lon,original.longitude)||
     !eq(request.locations[1].lat,destination.latitude)||!eq(request.locations[1].lon,destination.longitude))
    throw Error("Saved URL cannot reproduce reference-point request");
  evidence.push({candidate_id:o.candidate_id,destination_key:o.destination_key,
   reported_distance_m:o.meters,reported_duration_seconds:o.route_engine_reported_time_seconds,
   endpoint_quality:"address_number_reference_not_access_point",
   endpoint_snap_m:null,scoring_eligible:false,observed:true,
   source_url:o.request_url});
 }
 return {schema_version:"app023-pilot-summary-v0.1",cohort_id:pilot.cohort_id,
  planned_pairs:plan.expected_route_pairs,
  exploratory_observed_pairs:evidence.length,
  remaining_unprobed_pairs:plan.expected_route_pairs-evidence.length,
  quality_qualified_routes:0,
  scoring_eligible_routes:0,
  independent_accuracy:null,
  source_timestamp:source.source_meta_updated_utc,
  note:"Pilot requests were actually answered by the route engine, but endpoints and graph version have not been independently audited.",
  evidence};
}