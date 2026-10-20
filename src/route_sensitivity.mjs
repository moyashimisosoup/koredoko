/**
 * APP-023 research-only uncertainty stress tests for public named UR buildings.
 *
 * IMPORTANT: buffer_m is a counterfactual perturbation applied independently
 * to every route measurement. It is NOT a calibrated geolocation error band
 * or statistical confidence interval. No station exits or building entrances
 * have been independently measured, and OSM graph revision is not pinned.
 */
import {combinePhysicalStations, comparePublicCandidates} from "./public_building_rank.mjs";

const ALLOWED = new Set([0, 50, 100, 200, 400]);
const valid = n => typeof n === "number" && Number.isFinite(n);

function departureBandGap(distance, station) {
  const low=(station.min_minutes-1)*80;
  const high=station.max_minutes*80;
  return distance<=low ? low-distance : distance>high ? distance-high : 0;
}

export function walkingGapStressInterval(distance, station, buffer_m) {
  if (!valid(distance)||distance<0 || !ALLOWED.has(buffer_m)) {
    throw Error("Invalid stress-test measurement or buffer");
  }
  const lower=Math.max(0,distance-buffer_m);
  const upper=distance+buffer_m;
  const bandLow=(station.min_minutes-1)*80;
  const bandHigh=station.max_minutes*80;
  const intervalOverlapsBand=upper>bandLow && lower<=bandHigh;
  const minGap=intervalOverlapsBand?0:Math.min(
    departureBandGap(lower,station),departureBandGap(upper,station));
  const maxGap=Math.max(departureBandGap(lower,station),departureBandGap(upper,station));
  return { min_gap_m:Math.round(minGap), max_gap_m:Math.round(maxGap),
    observed_gap_m:Math.round(departureBandGap(distance,station)),
    tested_route_low_m:Math.round(lower),tested_route_high_m:Math.round(upper)};
}

/**
 * Evaluate counterfactual route ranges for the SAME four already-published
 * candidate buildings. The result cannot identify nonpublic homes or claim
 * a verified or statistically meaningful building match.
 */
export function auditPublicRankStability(doc,adId,buffer_m=100,selectedPlaces=null) {
  if (!ALLOWED.has(buffer_m)) throw Error("Only preregistered stress buffers supported");
  const nominal=comparePublicCandidates(doc,adId,selectedPlaces);
  const ad=doc.advertisements.find(a=>a.id===adId);
  const selected=selectedPlaces===null?ad.conditions:
    ad.conditions.filter(c=>selectedPlaces.includes(c.place_id));
  const combined=combinePhysicalStations(selected).stations;
  const candidates=nominal.ranked.map(row=>{
    const src=doc.candidates.find(c=>c.id===row.candidate_id);
    let minTotal=0,maxTotal=0,missing=0;
    const evidence=combined.map(st=>{
      const measurement=src.distances.find(d=>d.place_id===st.place_id);
      if(!measurement){missing++;return {
        place_id:st.place_id,measurement_missing:true,snap_review:true};}
      const interval=walkingGapStressInterval(measurement.meters,st,buffer_m);
      minTotal+=interval.min_gap_m;maxTotal+=interval.max_gap_m;
      return {place_id:st.place_id,measurement_missing:false,
        ...interval,start_snap_m:measurement.snap_start_m,
        end_snap_m:measurement.snap_end_m,
        snap_review:measurement.snap_start_m>25||measurement.snap_end_m>25,
        station_exit_verified:false,building_entrance_verified:false};
    });
    const snapReview=evidence.some(x=>x.snap_review);
    return {
      candidate_id:row.candidate_id,label:row.label,
      nominal_gap_m:row.total_absolute_gap_m,
      min_total_gap_m:missing?null:minTotal,
      max_total_gap_m:missing?null:maxTotal,
      incomplete_route_count:missing,
      snap_review:snapReview,
      evidence,
      candidate_quality:"reference_point_only",
      candidate_verified:false
    };
  });
  const top=candidates[0];
  const allComplete=candidates.every(x=>x.incomplete_route_count===0);
  const strictlyUniqueNominal=allComplete&&candidates.length>1 &&
    top.nominal_gap_m<candidates[1].nominal_gap_m;
  const robustNominalFirst=strictlyUniqueNominal && candidates.slice(1).every(
    x=>top.max_total_gap_m<x.min_total_gap_m);
  const topNeedsSnapReview=top.snap_review;
  return {
    advertisement_id:adId,
    buffer_m,
    uncertainty_model:"independent_symmetric_route_stress_not_calibrated",
    nominal_top_candidate_id:top.candidate_id,
    nominal_leader_tied:allComplete&&!strictlyUniqueNominal,
    reference_rank_robust_in_stress_window:robustNominalFirst,
    rank_state:!allComplete?"incomplete":
      !strictlyUniqueNominal?"nominal_tie":
      robustNominalFirst?"stress_stable_reference_rank":"stress_rank_ambiguous",
    top_has_large_endpoint_snap:topNeedsSnapReview,
    requires_exit_and_entrance_validation:true,
    official_entrance_coordinates_checked:false,
    route_graph_pinned:false,
    can_confirm_building:false,
    allow_automatic_candidate_exclusion:false,
    candidates
  };
}
