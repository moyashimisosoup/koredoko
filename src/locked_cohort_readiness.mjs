/**
 * APP-023: prevent an incomplete precommitted public-complex cohort from
 * becoming a misleading accuracy sample. The protocol is locked BEFORE
 * walking-route observations and unchanged by missing provider results.
 */
import {validatePublicDataset} from "./public_building_rank.mjs";
import {predictPublishedSet} from "./holdout_benchmark.mjs";

const idPair=(cid,station)=>cid+"|"+station;
const fail=message=>{throw Error("Locked holdout mismatch: "+message);};

export function inspectLockedPublicCohort(preregistered,observed){
 validatePublicDataset(preregistered);
 validatePublicDataset(observed);
 if(typeof preregistered.experiment_id!=="string"||
    preregistered.experiment_id!==observed.experiment_id)
   fail("experiment id differs");
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const origin=c=>({id:c.id,label:c.label,source_url:c.source_url,
    public_address_label:c.public_address_label,lat:c.lat,lon:c.lon,
    geocode_precision:c.geocode_precision});
 if(!same(preregistered.stations,observed.stations))fail("station references changed");
 if(!same(preregistered.advertisements,observed.advertisements))
   fail("advertisements or time bands changed");
 if(!same(preregistered.candidates.map(origin),observed.candidates.map(origin)))
   fail("candidate universe or address representative coordinates changed");
 if(preregistered.candidates.some(c=>c.distances.length!==0))
   fail("pre-registration already contains route distances");
 if(preregistered.candidates.length<4)
   fail("benchmark requires at least 4 public complexes");
 const expected=preregistered.candidates.flatMap(c=>
   preregistered.stations.map(s=>({candidate_id:c.id,place_id:s.id})));
 const observedPairs=new Set();
 for(const c of observed.candidates)for(const route of c.distances){
   const pair=idPair(c.id,route.place_id);
   if(observedPairs.has(pair))fail("duplicate route");
   observedPairs.add(pair);
 }
 const missing=expected.filter(p=>!observedPairs.has(idPair(p.candidate_id,p.place_id)));
 const completion=expected.length?observedPairs.size/expected.length:0;
 return {
   experiment_id:preregistered.experiment_id,
   candidate_count:preregistered.candidates.length,
   station_count:preregistered.stations.length,
   advertisement_count:preregistered.advertisements.length,
   expected_routes:expected.length,
   measured_routes:observedPairs.size,
   missing_routes:missing.length,
   missing_pairs:missing,
   completion_fraction:completion,
   locked_conditions_unchanged:true,
   can_grade_primary_cohort:missing.length===0,
   status:missing.length?"insufficient_route_coverage":"coverage_complete_not_accuracy_verified",
   identity_verified:false,
   independent_market_accuracy_established:false
 };
}
/** No partial "Top1 accuracy" may be published or silently inferred. */
export function predictOnlyIfComplete(preregistered,observed){
 const review=inspectLockedPublicCohort(preregistered,observed);
 if(!review.can_grade_primary_cohort)
   throw Error("Holdout not ready: "+review.missing_routes+" missing route measurements");
 return predictPublishedSet(observed);
}
