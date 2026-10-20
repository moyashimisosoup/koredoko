/** APP-023: research comparison of already-public named UR housing complexes.
 * Numeric rankings here are deviations from publicly advertised walking distance
 * bands, NOT location probabilities or validated route-to-entrance distances.
 */

const isObj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const validMinutes=v=>Number.isInteger(v)&&v>=1&&v<=180;
const text=v=>typeof v==="string"&&v.length>0;
export function validatePublicDataset(doc){
 if(!isObj(doc)||doc.schema_version!=="public-complex-crosscheck-v0.1"||
    !Array.isArray(doc.stations)||doc.stations.length<2||doc.stations.length>15||
    !Array.isArray(doc.candidates)||doc.candidates.length<2||doc.candidates.length>30||
    !Array.isArray(doc.advertisements)||doc.advertisements.length<1||doc.advertisements.length>30)
   throw Error("Invalid crosscheck dataset");
 const stations=new Set();
 for(const s of doc.stations){
   if(!isObj(s)||!text(s.id)||stations.has(s.id)||!finite(s.lat)||!finite(s.lon)||
      Math.abs(s.lat)>90||Math.abs(s.lon)>180)throw Error("Invalid station");
   stations.add(s.id);
 }
 const candidates=new Set();
 for(const c of doc.candidates){
  if(!isObj(c)||!text(c.id)||candidates.has(c.id)||!text(c.label)||
     !text(c.source_url)||!c.source_url.startsWith("https://www.ur-net.go.jp/")||
     !finite(c.lat)||!finite(c.lon)||Math.abs(c.lat)>90||Math.abs(c.lon)>180||
     !Array.isArray(c.distances)||c.distances.length>20)throw Error("Invalid public candidate");
  candidates.add(c.id);
  const ids=new Set();
  for(const d of c.distances){
   if(!isObj(d)||!stations.has(d.place_id)||ids.has(d.place_id)||
       !finite(d.meters)||d.meters<=0||d.meters>20000||
       !finite(d.air_m)||d.air_m<0||
       !finite(d.snap_start_m)||d.snap_start_m<0||
       !finite(d.snap_end_m)||d.snap_end_m<0||
       d.meters+d.snap_start_m+d.snap_end_m+4<d.air_m)
     throw Error("Invalid measured route");
   ids.add(d.place_id);
  }
 }
 const ads=new Set();
 for(const a of doc.advertisements){
  if(!isObj(a)||!text(a.id)||ads.has(a.id)||!text(a.source_url)||
     !a.source_url.startsWith("https://www.ur-net.go.jp/")||
     !Array.isArray(a.conditions)||a.conditions.length<1||a.conditions.length>20)
    throw Error("Invalid public advertisement");
  ads.add(a.id);
  for(const co of a.conditions){
   if(!isObj(co)||co.kind!=="walk"||!stations.has(co.place_id)||
      !text(co.label)||!validMinutes(co.min_minutes)||!validMinutes(co.max_minutes)||
      co.min_minutes>co.max_minutes)throw Error("Invalid advertisement walking condition");
  }
 }
}

export function combinePhysicalStations(conditions){
 if(!Array.isArray(conditions)||conditions.length<1)throw Error("Missing conditions");
 const byPlace=new Map();
 let duplicates=0;
 for(const co of conditions){
  if(co.kind!=="walk"||!text(co.place_id)||!validMinutes(co.min_minutes)||
     !validMinutes(co.max_minutes)||co.min_minutes>co.max_minutes)throw Error("Invalid walking condition");
  const prev=byPlace.get(co.place_id);
  if(prev){
   duplicates++;
   prev.min_minutes=Math.min(prev.min_minutes,co.min_minutes);
   prev.max_minutes=Math.max(prev.max_minutes,co.max_minutes);
   prev.labels.push(co.label);
  } else byPlace.set(co.place_id,{place_id:co.place_id,min_minutes:co.min_minutes,
    max_minutes:co.max_minutes,labels:[co.label]});
 }
 return {stations:[...byPlace.values()],duplicate_line_constraints:duplicates};
}
function comparison(band,measurement){
 const low=(band.min_minutes-1)*80,up=band.max_minutes*80;
 const d=measurement;
 const diff=d<=low ? Math.round(d-low) : d>up ? Math.round(d-up) : 0;
 return {min_exclusive_m:low,max_inclusive_m:up,measured_m:d,
   difference_signed_m:diff,absolute_distance_gap_m:Math.abs(diff),
   observed_in_nominal_band:diff===0};
}
function evaluateCandidate(candidate,stations){
 const evidence=stations.map(st=>{
  const measurement=candidate.distances.find(x=>x.place_id===st.place_id);
  if(!measurement)return {place_id:st.place_id,label:st.labels.join(" / "),
    status:"missing",absolute_distance_gap_m:null,reason:"walking_route_not_measured"};
  const compare=comparison(st,measurement.meters);
  const quality=measurement.snap_start_m>25||measurement.snap_end_m>25 ?
    "endpoint_snap_review":"station_exit_and_graph_unverified";
  return {place_id:st.place_id,label:st.labels.join(" / "),
    status:compare.observed_in_nominal_band?"representative_band_near":"representative_distance_differs",
    ...compare,quality,road_start_snap_m:measurement.snap_start_m,road_end_snap_m:measurement.snap_end_m,
    reason:"reference_points_not_verified_entrances"};
 });
 const known=evidence.filter(x=>x.absolute_distance_gap_m!==null);
 return {candidate_id:candidate.id,label:candidate.label,official_url:candidate.source_url,
   available_routes:known.length,conditions:evidence.length,
   total_absolute_gap_m:known.length===evidence.length?
     known.reduce((s,x)=>s+x.absolute_distance_gap_m,0):null,
   evidence,
   quality_gates_passed:false,can_confirm_match:false,
   location_probability:null,origin_precision:candidate.geocode_precision};
}
export function comparePublicCandidates(doc,adId,selectedPlaces=null){
 validatePublicDataset(doc);
 const ad=doc.advertisements.find(a=>a.id===adId);
 if(!ad)throw Error("Unknown advertisement");
 const matched=selectedPlaces===null?ad.conditions:ad.conditions.filter(x=>selectedPlaces.includes(x.place_id));
 if(!matched.length)throw Error("At least one walking constraint required");
 const {stations,duplicate_line_constraints}=combinePhysicalStations(matched);
 const ranked=doc.candidates.map(c=>evaluateCandidate(c,stations));
 ranked.sort((a,b)=>{
  if(a.total_absolute_gap_m===null)return b.total_absolute_gap_m===null?
    a.candidate_id.localeCompare(b.candidate_id):1;
  if(b.total_absolute_gap_m===null)return -1;
  return a.total_absolute_gap_m-b.total_absolute_gap_m ||
         a.candidate_id.localeCompare(b.candidate_id);
 });
 return {advertisement_id:adId,ad_source:ad.source_url,
   station_condition_count:stations.length,
   duplicate_line_constraints,
   method:"minimum_nominal_band_gap_not_calibrated",
   nominal_top_candidate_id:ranked[0].candidate_id,
   candidate_count:ranked.length,ranked,
   result_state:"exploratory_only_all_entries_public",
   verified_identification:false,quality_review_needed:true};
}
