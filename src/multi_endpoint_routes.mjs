/**
 * Public-complex walking-route comparison across several entrance/exit samples.
 * NOT a residence lookup or a statistically calibrated accuracy engine.
 * No synthetic route measurements may be silently substituted for measured ones.
 */
import {validatePublicDataset, combinePhysicalStations} from "./public_building_rank.mjs";

const finite = x => typeof x === "number" && Number.isFinite(x);
const string = x => typeof x === "string" && x.length > 0;
const MAX_OPTIONS_PER_PAIR = 16;
const MAX_RECORDS = 30 * 15 * MAX_OPTIONS_PER_PAIR;
const snapReviewM = 25;
const bandGap=(meters,st)=>{
  const lo=(st.min_minutes-1)*80,hi=st.max_minutes*80;
  return meters<=lo ? lo-meters : meters>hi ? meters-hi : 0;
};

export function asSinglePointRoutes(doc) {
  validatePublicDataset(doc);
  const routes=doc.candidates.flatMap(c=>c.distances.map(d=>({
    candidate_id:c.id,place_id:d.place_id,
    origin_id:c.id+":gsi-address-reference",exit_id:d.place_id+":n02-station-reference",
    origin_type:"address_reference",exit_type:"station_reference",
    meters:d.meters,snap_start_m:d.snap_start_m,snap_end_m:d.snap_end_m,
    provenance:"legacy_observed_public_route",
    route_source:"valhalla_pedestrian_observed",
    identity_independent:false
  })));
  return {schema_version:"public-route-options-v0.1",routes,
    baseline:"single_station_reference",graph_version:"unknown",
    status:"legacy_observed_reference_points"};
}

export function validateRouteOptions(doc, options) {
  validatePublicDataset(doc);
  if(options?.schema_version!=="public-route-options-v0.1"||
     !Array.isArray(options.routes)||options.routes.length===0||
     options.routes.length>MAX_RECORDS)throw Error("Invalid public route options");
  const cids=new Set(doc.candidates.map(x=>x.id));
  const places=new Set(doc.stations.map(x=>x.id));
  const found=new Set(),counts=new Map();
  for(const r of options.routes){
    if(!r || !cids.has(r.candidate_id)||!places.has(r.place_id)||
       !string(r.origin_id)||!string(r.exit_id)||
       !["address_reference","published_complex_access_point"].includes(r.origin_type)||
       !["station_reference","station_exit"].includes(r.exit_type)||
       !finite(r.meters)||r.meters<=0||r.meters>20000||
       !finite(r.snap_start_m)||r.snap_start_m<0||
       !finite(r.snap_end_m)||r.snap_end_m<0||
       !string(r.provenance)||!string(r.route_source)||
       r.identity_independent!==false)throw Error("Invalid measured route option");
    const key=JSON.stringify([r.candidate_id,r.place_id,r.origin_id,r.exit_id]);
    if(found.has(key))throw Error("Duplicate route option");
    found.add(key);
    const pair=r.candidate_id+"/"+r.place_id;
    counts.set(pair,(counts.get(pair)||0)+1);
    if(counts.get(pair)>MAX_OPTIONS_PER_PAIR)throw Error("Too many route options for one station");
    if(r.origin_type==="published_complex_access_point"&&!string(r.origin_source_url))
      throw Error("Public entrance provenance required");
    if(r.exit_type==="station_exit"&&!string(r.exit_source_url))
      throw Error("Exit provenance required");
  }
  if(!string(options.graph_version))throw Error("Graph revision state required");
}
const sortByMeters=(a,b)=>a.meters-b.meters || a.origin_id.localeCompare(b.origin_id)||
  a.exit_id.localeCompare(b.exit_id);

/**
 * The primary comparison chooses the minimum observed pedestrian distance to
 * ANY documented exit, rather than selecting whichever route best matches the
 * advertisement. "Best matching exit" would induce hidden answer leakage.
 * The full route-span gap interval is reported separately as uncertainty.
 */
export function evaluateExitAwarePublicCandidates(doc,options,adId,{selectedPlaces=null}={}) {
  validateRouteOptions(doc,options);
  const ad=doc.advertisements.find(x=>x.id===adId);
  if(!ad)throw Error("Unknown advertisement");
  const conditions=selectedPlaces===null?ad.conditions:ad.conditions.filter(c=>selectedPlaces.includes(c.place_id));
  if(!conditions.length)throw Error("At least one walking condition required");
  const {stations,duplicate_line_constraints}=combinePhysicalStations(conditions);
  const rows=doc.candidates.map(c=>{
    let min_total_gap_m=0,max_total_gap_m=0,nominal_gap_m=0,missing=0;
    const evidence=stations.map(st=>{
      const variants=options.routes.filter(r=>r.candidate_id===c.id&&r.place_id===st.place_id).slice().sort(sortByMeters);
      if(!variants.length){missing++;return {place_id:st.place_id,status:"route_missing",alternative_routes:0,nominal_m:null};}
      const selected=variants[0]; // SHORTEST, not the best fit to the advertisement
      const routeGaps=variants.map(x=>bandGap(x.meters,st));
      const lo=Math.min(...routeGaps),hi=Math.max(...routeGaps),gap=bandGap(selected.meters,st);
      min_total_gap_m+=lo;max_total_gap_m+=hi;nominal_gap_m+=gap;
      return {
        place_id:st.place_id,status:variants.length>1?"multiple_reference_routes":"single_reference_route",
        alternative_routes:variants.length,
        selected_rule:"minimum_measured_pedestrian_distance",
        selected_origin_id:selected.origin_id,selected_exit_id:selected.exit_id,
        nominal_m:selected.meters,observed_range_m:[variants[0].meters,variants.at(-1).meters],
        advertised_m:[(st.min_minutes-1)*80,st.max_minutes*80],
        nominal_gap_m:gap,min_possible_gap_m:lo,max_possible_gap_m:hi,
        any_large_endpoint_snap:variants.some(x=>x.snap_start_m>snapReviewM||x.snap_end_m>snapReviewM),
        endpoints_surveyed:false,
        station_exit_points_supplied:variants.filter(x=>x.exit_type==="station_exit").length
      };
    });
    return {
      candidate_id:c.id,label:c.label,official_url:c.source_url,
      matched_destinations:stations.length-missing,missing_destinations:missing,
      nominal_gap_m:missing?null:Math.round(nominal_gap_m),
      min_total_gap_m:missing?null:Math.round(min_total_gap_m),
      max_total_gap_m:missing?null:Math.round(max_total_gap_m),
      reference_only:true,can_confirm_identity:false,evidence
    };
  });
  rows.sort((a,b)=> {
    if(a.nominal_gap_m===null)return b.nominal_gap_m===null?
      a.candidate_id.localeCompare(b.candidate_id):1;
    if(b.nominal_gap_m===null)return -1;
    return a.nominal_gap_m-b.nominal_gap_m || a.candidate_id.localeCompare(b.candidate_id);
  });
  const winner=rows[0],complete=rows.every(x=>x.nominal_gap_m!==null);
  const robust=complete && rows.length>1 &&
    winner.nominal_gap_m<rows[1].nominal_gap_m &&
    rows.slice(1).every(x=>winner.max_total_gap_m<x.min_total_gap_m);
  return {
    ad_id:adId,method:"nearest_measured_exit_then_nominal_band_gap",
    distinct_station_conditions:stations.length,duplicate_line_constraints,
    candidate_count:rows.length,route_options_count:options.routes.length,
    nominal_top1_id:winner?.nominal_gap_m===null?null:winner.candidate_id,
    rank_reference_robust_across_supplied_routes:robust,
    required_external_accuracy_validation:true,
    official_entrances_verified:false,identity_confirmed:false,
    output_kind:"public_named_complex_reference_ranking",rows
  };
}
