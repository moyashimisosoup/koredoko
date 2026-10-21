/**
 * APP-023: immutable-ish ledger merge for measured public-building route pairs.
 * Input observations are externally supplied and REQUIRE exact route evidence.
 * Never fabricate routing measurements, exact exits or statistical accuracy.
 */
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const str=s=>typeof s==="string"&&s.trim().length>0;
const url=s=>typeof s==="string"&&/^https:\/\/[^/\s?#]+(?:[/?#]|$)/.test(s);
const validTimestamp=s=>str(s)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s)&&
 Number.isFinite(Date.parse(s));
const key=(candidate,destination)=>candidate+"|"+destination;
const INVALID="Invalid route evidence";
function validateObservation(o,planned){
 if(!o||!str(o.candidate_id)||!str(o.destination_key)||!planned.has(key(o.candidate_id,o.destination_key))||
    o.travel_mode!=="pedestrian"||!finite(o.meters)||o.meters<=0||o.meters>30000||
    !finite(o.snap_start_m)||!finite(o.snap_end_m)||o.snap_start_m<0||o.snap_end_m<0||
    o.snap_start_m>3000||o.snap_end_m>3000||
    !["measured_public_route","synthetic_test_only"].includes(o.record_class)||
    !str(o.engine)||!str(o.route_dataset_revision)||!url(o.route_source_url)||
    !validTimestamp(o.observed_at)||!str(o.origin_point_kind)||!str(o.destination_point_kind)||
    !url(o.origin_point_source_url)||!url(o.destination_point_source_url)||
    typeof o.origin_entrance_verified!=="boolean"||
    typeof o.destination_entrance_verified!=="boolean")
    throw Error(INVALID);
 // A reference point is not an audited exit simply because its value is precise.
 const reference=/block|representative|centroid|address|unknown/i;
 if(o.origin_entrance_verified&&reference.test(o.origin_point_kind))throw Error("Reference point cannot assert a verified entrance");
 if(o.destination_entrance_verified&&reference.test(o.destination_point_kind))throw Error("Reference point cannot assert a verified entrance");
 if(o.record_class==="measured_public_route" && (
     o.route_source_url.includes("example.org")||
     o.route_source_url.includes("example.com")||
     o.origin_point_source_url.includes("example.com")||
     o.destination_point_source_url.includes("example.com")))
   throw Error("Placeholder URL cannot evidence a measured route");
 return o;
}
/**
 * Keep the caller's plan immutable, accept only externally documented observations.
 * "Measured" is still a route between annotated reference points, NOT proof
 * that the public building lies precisely at that location.
 */
export function auditHibariRouteObservations(plan,observations,{snapWarnM=25}={}){
 if(plan?.schema_version!=="app023-route-coverage-v0.1"||!Array.isArray(plan.routes)||
    !Number.isInteger(plan.expected_route_pairs)||plan.expected_route_pairs!==plan.routes.length||
    !Number.isInteger(plan.candidate_count)||plan.candidate_count<1||
    !Array.isArray(observations)||observations.length>plan.expected_route_pairs||
    !finite(snapWarnM)||snapWarnM<0||snapWarnM>100)
  throw Error("Invalid planned routes or observation list");
 const planned=new Set(plan.routes.map(r=>key(r.candidate_id,r.destination_key)));
 if(planned.size!==plan.routes.length)throw Error("Duplicate planned route pair");
 const byKey=new Map();
 for(const o of observations){
  validateObservation(o,planned);
  const k=key(o.candidate_id,o.destination_key);
  if(byKey.has(k))throw Error("Duplicate observed route pair");
  byKey.set(k,o);
 }
 const rows=plan.routes.map(p=>{
  const o=byKey.get(key(p.candidate_id,p.destination_key));
  if(!o)return {...p,status:"pedestrian_route_missing",meters:null,
    observed:false,eligible_for_scoring:false,quality_flags:["route_not_measured"]};
  const synthetic=o.record_class==="synthetic_test_only";
  const highSnap=o.snap_start_m>snapWarnM||o.snap_end_m>snapWarnM;
  const entrances=o.origin_entrance_verified&&o.destination_entrance_verified;
  const flags=[...(!entrances?["access_point_not_verified"]:[]),
    ...(highSnap?["endpoint_snap_review"]:[]),
    ...(synthetic?["synthetic_not_a_measurement"]:[])];
  const referenceSafe=!synthetic&&!highSnap;
  return {candidate_id:p.candidate_id,destination_key:p.destination_key,
   destination_kind:p.destination_kind,status:synthetic?"synthetic_test_only":
    !referenceSafe?"observed_reference_route_needs_review":
    !entrances?"observed_reference_route_not_entrance":
      "observed_entrance_route_needs_independent_review",
   meters:o.meters,snap_start_m:o.snap_start_m,snap_end_m:o.snap_end_m,
   observed:!synthetic,record_class:o.record_class,route_source_url:o.route_source_url,
   route_dataset_revision:o.route_dataset_revision,engine:o.engine,
   observed_at:o.observed_at,origin_point_kind:o.origin_point_kind,
   destination_point_kind:o.destination_point_kind,quality_flags:flags,
   eligible_for_scoring:referenceSafe&&entrances,
   confirmed_identity:false};
 });
 const measured=rows.filter(r=>r.observed).length;
 const synthetic=rows.filter(r=>r.record_class==="synthetic_test_only").length;
 const reviewed=rows.filter(r=>r.eligible_for_scoring).length;
 return {schema_version:"app023-route-observation-audit-v0.1",
  cohort_id:plan.cohort_id,public_candidate_count:plan.candidate_count,
  planned_route_pairs:plan.expected_route_pairs,
  measured_route_pairs:measured,synthetic_test_pairs:synthetic,
  missing_route_pairs:rows.length-measured-synthetic,
  entrance_review_needed_pairs:measured-reviewed,
  potentially_scoring_eligible_pairs:reviewed,
  fully_observed:measured===rows.length,
  ready_for_blind_accuracy:false,
  independent_accuracy:null,can_identify_private_home:false,
  disclaimer:"Route observations between reference points are NOT building/entrance proofs. Ranking requires separately frozen candidate and advertising inputs.",
  rows};
}
