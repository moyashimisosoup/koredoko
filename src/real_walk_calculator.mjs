/** Public UR complex walking-route measurements, not a building-identification engine.
 * All API distances are between GSI address reference points and N02 station
 * representative points, NOT surveyed station exits or building entrances.
 */

const validCoord = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0])<=90 && Math.abs(p[1])<=180;
const isNumber = x => typeof x==="number" && Number.isFinite(x);
const routeApi="https://valhalla1.openstreetmap.de/route";

export function metersBetween(from,to) {
  if(!validCoord(from)||!validCoord(to)) throw new Error("Invalid coordinate");
  const r=Math.PI/180,a=(to[0]-from[0])*r,b=(to[1]-from[1])*r;
  const d=Math.sin(a/2)**2+Math.cos(from[0]*r)*Math.cos(to[0]*r)*Math.sin(b/2)**2;
  return 12742000*Math.asin(Math.sqrt(Math.max(0,Math.min(1,d))));
}
export function decodePolyline6(s) {
  if(typeof s!=="string"||!s.length||s.length>500000) throw new Error("Invalid geometry");
  const points=[];let lat=0,lon=0,i=0;
  while(i<s.length){
    const deltas=[];
    for(let k=0;k<2;k++){
      let n=0,shift=0,b;
      do {
        if(i>=s.length||shift>35)throw new Error("Truncated route geometry");
        b=s.charCodeAt(i++)-63;
        if(b<0||b>63)throw new Error("Bad geometry alphabet");
        n|=(b&31)<<shift;shift+=5;
      }while(b>=32);
      deltas.push(n&1?~(n>>1):n>>1);
    }
    lat+=deltas[0];lon+=deltas[1];
    const p=[lat/1000000,lon/1000000];
    if(!validCoord(p))throw new Error("Invalid route coordinate");
    points.push(p);
  }
  if(points.length<2)throw new Error("Route shape too short");
  return points;
}
export function routeRequestUrl(from,to) {
  if(!validCoord(from)||!validCoord(to)) throw new Error("Invalid route endpoints");
  const json=JSON.stringify({locations:[{lat:from[0],lon:from[1]},{lat:to[0],lon:to[1]}],
    costing:"pedestrian",units:"kilometers",directions_type:"none",shape_format:"polyline6"});
  return routeApi+"?json="+encodeURIComponent(json);
}
export function inspectRouteResponse(response,from,to) {
  if(!validCoord(from)||!validCoord(to))throw new Error("Invalid requested coordinates");
  if(!response || response.trip?.status!==0 || response.trip?.units!=="kilometers" ||
    !isNumber(response.trip?.summary?.length)||response.trip.summary.length<=0 ||
    !Array.isArray(response.trip?.legs)||!response.trip.legs[0]?.shape)
    throw new Error("Routing API response invalid");
  const pts=decodePolyline6(response.trip.legs[0].shape);
  const road=response.trip.summary.length*1000;
  const snapStart=metersBetween(from,pts[0]);
  const snapEnd=metersBetween(to,pts.at(-1));
  const straight=metersBetween(from,to);
  if(road+snapStart+snapEnd+3 < straight)throw new Error("Geometrically impossible route");
  return {road_m:Math.round(road),straight_m:Math.round(straight),
    snap_start_m:Math.round(snapStart),snap_end_m:Math.round(snapEnd),
    time_s:Math.round(response.trip.summary.time||0)};
}
export async function fetchWalkingRoute(from,to,fetcher=fetch) {
  const url=routeRequestUrl(from,to);
  const controller=new AbortController();
  // Caller refreshes only one route at a time; demo use is fair-use only.
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetcher(url,{
      method:"GET",signal:controller.signal,
      headers:{"X-Client-Id":"github.com/moyashimisosoup/koredoko-research"}
    });
    if(!response.ok)throw new Error("Route API HTTP "+response.status);
    return inspectRouteResponse(await response.json(),from,to);
  } finally {clearTimeout(timeout);}
}
function upperBand(c,override) {
  if(override!==undefined && (!Number.isInteger(override)||override<1||override>180))
    throw new Error("徒歩分数は1〜180の整数にしてください");
  const lower=override===undefined?c.minutes_min:override;
  const upper=override===undefined?c.minutes_max:override;
  if(!Number.isInteger(lower)||!Number.isInteger(upper)||lower<1||upper>180||upper<lower)
    throw new Error("Invalid advertised minute range");
  return {min_minutes:lower,max_minutes:upper,lower_exclusive_m:(lower-1)*80,upper_inclusive_m:upper*80};
}
export function inspectGroup(group,overrideMinutes=undefined) {
  if(!group || !Array.isArray(group.targets) || group.targets.length<1 || group.targets.length>5)
    throw new Error("Invalid station group");
  const band=upperBand(group,overrideMinutes);
  const rows=group.targets.map(t=>{
    const s=t.sample;
    if(!s || ![s.road_m,s.straight_m,s.snap_start_m,s.snap_end_m,s.time_s].every(isNumber)||
      s.road_m<=0||s.straight_m<0||s.snap_start_m<0||s.snap_end_m<0||
      s.road_m+s.snap_start_m+s.snap_end_m+4<s.straight_m)
      throw new Error("Route observation invalid");
    const observed=s.road_m;
    const deviation_m=observed<band.lower_exclusive_m?Math.round(observed-band.lower_exclusive_m):
       observed>band.upper_inclusive_m?Math.round(observed-band.upper_inclusive_m):0;
    let status=deviation_m===0?"provisional_band_match":"provisional_difference";
    let reason="station_reference_not_exit";
    if(s.snap_start_m>25||s.snap_end_m>25){
      status="review_snap";reason="large_endpoint_snap";
    }
    return {road_m:observed,air_m:s.straight_m,start_snap_m:s.snap_start_m,
      end_snap_m:s.snap_end_m,seconds:s.time_s,delta_outside_band_m:deviation_m,
      status,reason,place_source:t.source,point:[t.lat,t.lon]};
  });
  const sourcesDiverge=rows.length>1&&(Math.max(...rows.map(x=>x.road_m))-Math.min(...rows.map(x=>x.road_m))>80);
  return {place_id:group.place_id,label:group.label,band,rows,
    reference_variation_m:rows.length>1?Math.max(...rows.map(x=>x.road_m))-Math.min(...rows.map(x=>x.road_m)):0,
    outcome:sourcesDiverge?"ambiguous_station_representatives":rows.some(x=>x.status==="review_snap")?
      "requires_endpoint_review":rows.every(x=>x.delta_outside_band_m===0)?"reference_band_near":"reference_distance_differs",
    validated_advertisement_match:false,
    reasons:["GSI_address_reference_not_building_entrance","N02_station_reference_not_exit","graph_version_unpinned",
      ...(sourcesDiverge?["multiple_station_points_disagree"]:[])]};
}
export function evaluatePublicComplex(item,overrides={}) {
  if(!item||!Array.isArray(item.origin)||!validCoord(item.origin)||
    !Array.isArray(item.conditions)||item.conditions.length<1||item.conditions.length>20)
    throw new Error("Invalid public complex");
  const groups=item.conditions.map(c=>inspectGroup(c,overrides[c.place_id]));
  return {case_id:item.case_id,complex:item.complex,official_url:item.official_url,
    source_precision:item.gsi_precision,groups,route_count:groups.reduce((a,g)=>a+g.rows.length,0),
    summary:{roughly_consistent:groups.filter(g=>g.outcome==="reference_band_near").length,
      distance_differs:groups.filter(g=>g.outcome==="reference_distance_differs").length,
      needs_review:groups.filter(g=>["requires_endpoint_review","ambiguous_station_representatives"].includes(g.outcome)).length},
    overall_state:"research_only_not_verified",probability:null};
}
export function evaluateDataset(doc) {
  if(doc?.schema_version!=="public-ur-real-routes-v0.1"||!Array.isArray(doc.cases)||doc.cases.length===0||doc.cases.length>20)
    throw new Error("Invalid dataset");
  const cases=doc.cases.map(c=>evaluatePublicComplex(c));
  return {cases,case_count:cases.length,route_count:cases.reduce((a,c)=>a+c.route_count,0),
    claim_accuracy:false,unverified_gates:["address_reference","station_exit","route_graph_revision"]};
}
