/**
 * APP-023: locked baseline for repeated evaluation on independently selected
 * published UR complexes. Address/ground-truth IDs are never consulted when
 * predicting. This is an explicitly limited public-listing pseudo-blind test,
 * not a representative commercial-location accuracy estimate.
 */
import {comparePublicCandidates} from "./public_building_rank.mjs";
import {auditPublicRankStability} from "./route_sensitivity.mjs";

export const BASELINE = Object.freeze({
  name:"walking-band-gap-v0.1",
  meters_per_advertised_minute:80,
  nominal_score:"sum_absolute_distance_outside_advertised_interval",
  repeated_physical_station:"merge_union_avoid_double_counting",
  missing_route:"candidate_last",
  tie_breaker:"candidate_id_ascending",
  stress_buffer_m:100,
  reference_rank_robustness:"provisional_only_no_identification",
  require_public_named_complexes:true,
  source_of_truth:"held_out_until_after_ranking"
});

/** This API must not receive the ground-truth map. */
export function predictPublishedSet(doc,{stressBuffer=100}={}) {
 if(stressBuffer!==BASELINE.stress_buffer_m)
   throw Error("Baseline stress buffer is preregistered at 100m");
 if(!Array.isArray(doc?.advertisements)||!Array.isArray(doc?.candidates) ||
   doc.advertisements.length<2||doc.candidates.length<3)
   throw Error("Too few public advertisements/candidates for this benchmark");
 const cases=doc.advertisements.map(ad=>{
   const result=comparePublicCandidates(doc,ad.id);
   const robustness=auditPublicRankStability(doc,ad.id,stressBuffer);
   return {
     advertisement_id:ad.id,
     candidate_count:result.candidate_count,
     destination_count:result.station_condition_count,
     repeated_place_groups_suppressed:result.duplicate_line_constraints,
     nominal_top1:result.nominal_top_candidate_id,
     ranked_candidate_ids:result.ranked.map(x=>x.candidate_id),
     ranked_gap_m:result.ranked.map(x=>x.total_absolute_gap_m),
     reference_stable_under_stress:robustness.reference_rank_robust_in_stress_window,
     rank_state:robustness.rank_state,
     // No physically surveyed building+station exits or independent held-out
     // accuracy check exists, even if the nominal ranking appears decisive.
     eligible_for_identity_assertion:false
   };
 });
 return {
   experiment:"public_listing_holdout",
   config:BASELINE,
   sample_count:cases.length,
   candidate_universe_count:doc.candidates.length,
   truth_used_during_prediction:false,
   cases
 };
}

/** Answer key is supplied ONLY after prediction output is frozen. */
export function gradePublishedSet(predictions, answerKey) {
 if(predictions?.truth_used_during_prediction!==false ||
    !Array.isArray(predictions?.cases)||
    !Array.isArray(answerKey?.answers))
   throw Error("Valid frozen predictions and answer key required");
 const truths=new Map(answerKey.answers.map(x=>[x.advertisement_id,x.correct_candidate_id]));
 if(truths.size!==answerKey.answers.length || truths.size!==predictions.cases.length)
   throw Error("Answer key size/uniqueness mismatch");
 let top1=0,top2=0,top3=0,forced=0,abstained=0,missing=0;
 const cases=predictions.cases.map(row=>{
   const truth=truths.get(row.advertisement_id);
   if(typeof truth!=="string"||!row.ranked_candidate_ids.includes(truth))
     throw Error("Missing truth or candidate outside declared universe");
   const rank=row.ranked_candidate_ids.indexOf(truth)+1;
   const checkable=row.ranked_gap_m.every(x=>typeof x==="number"&&Number.isFinite(x));
   if(!checkable)missing++;
   const decision=row.eligible_for_identity_assertion===true && checkable?"provisional":"abstain";
   if(decision==="abstain")abstained++;else forced++;
   if(rank===1)top1++;if(rank<=2)top2++;if(rank<=3)top3++;
   return {
     advertisement_id:row.advertisement_id,
     true_candidate_rank:rank,
     nominal_top1_correct:rank===1,
     decision,reference_rank_state:row.rank_state,
     gap_top_m:row.ranked_gap_m[0],gap_second_m:row.ranked_gap_m[1]??null
   };
 });
 const n=cases.length;
 return {
   evaluated_ads:n,
   universe_size:predictions.candidate_universe_count,
   top1_count:top1,top1_rate:top1/n,
   top2_count:top2,top2_rate:top2/n,
   top3_count:top3,top3_rate:top3/n,
   abstained_count:abstained,abstention_rate:abstained/n,
   eligible_assertions:forced,
   ads_with_any_missing_candidate_route:missing,
   general_population_accuracy_established:false,
   independent_source_of_routing_verified:false,
   interpreted_as:"fixed-small-public-set-development-benchmark",
   cases
 };
}
