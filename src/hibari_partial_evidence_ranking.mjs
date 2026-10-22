/**
 * APP-023: non-excluding exploratory ordering from partial public evidence.
 * A reference-model order is NOT a pedestrian route, probability, or accuracy.
 * Missing dimensions are neutral, never scored as 0m or a failed condition.
 */
const rad=Math.PI/180;
const ok=n=>typeof n==="number"&&Number.isFinite(n);
const SCENARIOS=[1,1.3,1.6]; // what-if factors, NOT measured/calibrated ratios
const QUALITY={address_number_reference_only:1,town_chome_reference_only:0.25};
const metric=(a,b)=>{
 const dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad;
 const x=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};
const expected=clue=>{
 // Prefer the advertisement's explicitly quoted approximate metres,
 // otherwise its explicitly quoted minutes as an 80m/min reference.
 if(ok(clue.claimed_approx_m)&&clue.claimed_approx_m>0)return clue.claimed_approx_m;
 const n=clue.advertised_walk_minutes;
 return Number.isInteger(n)&&n>0?Math.round((n-0.5)*80):null;
};
const round=n=>Math.round(n*10)/10;
const marker=(data,id)=>data.find(p=>p.id===id);
const destination=id=>id==="station:seibu-hibarigaoka"?id:"facility:"+id;
const compare=(a,b)=>a.total_gap-b.total_gap||a.candidate_id.localeCompare(b.candidate_id);
const ranks=(rows,key)=>{
 const ordered=[...rows].filter(x=>x.available_clues>0).sort((a,b)=>a.scenario_scores[key]-b.scenario_scores[key]||a.candidate_id.localeCompare(b.candidate_id));
 // Conservative dense rank ties within model resolution (3 percentage points).
 let dense=0,previous=null;const assigned=new Map();
 for(const a of ordered){
  const score=a.scenario_scores[key];
  if(previous===null||Math.abs(score-previous)>0.03)dense++;
  assigned.set(a.candidate_id,dense);previous=score;
 }
 return assigned;
};
export function buildHibariExploratoryOrder(conditions,candidates,locations,{focusFactor=1.3}={}){
 if(!Array.isArray(conditions)||conditions.length>40||
    !Array.isArray(candidates)||candidates.length!==7||
    !Array.isArray(locations)||locations.length>25||
    !SCENARIOS.includes(focusFactor)||
    new Set(candidates.map(c=>c.id)).size!==7)
   throw Error("Unexpected exploratory comparison input");
 const ref=new Map(locations.map(p=>[p.id,p]));
 const results=candidates.map(candidate=>{
  const b=ref.get(candidate.id),evidence=[];
  for(const clue of conditions){
   const p=ref.get(destination(clue.place_id));
   const quoted=expected(clue);
   if(!quoted||!b?.coordinates||!p?.coordinates){
    evidence.push({place_id:clue.place_id,status:"reference_or_quote_missing",
     approximate_advertised_m:quoted,straight_reference_m:null,
     reference_quality:"missing",used_for_model:false,
     observed_pedestrian_route_m:null});
    continue;
   }
   const qb=QUALITY[b.quality],qp=QUALITY[p.quality];
   if(!qb||!qp)throw Error("Unrecognized location reference quality");
   const air=metric(b.coordinates,p.coordinates);
   const quality=Math.min(qb,qp);
   evidence.push({place_id:clue.place_id,status:"exploratory_reference_only",
    approximate_advertised_m:quoted,
    straight_reference_m:round(air),reference_quality:quality===1?"number_number":"town_level_involved",
    contribution_weight:quality,used_for_model:true,
    observed_pedestrian_route_m:null,
    tentative_distance_scenarios_m:SCENARIOS.map(k=>round(air*k))});
  }
  const usable=evidence.filter(e=>e.used_for_model);
  const scores=SCENARIOS.map(k=>{
   const sum=usable.reduce((v,e)=>v+e.contribution_weight*
     Math.min(Math.abs((e.straight_reference_m*k)-e.approximate_advertised_m)/
       Math.max(150,e.approximate_advertised_m),4),0);
   const weight=usable.reduce((v,e)=>v+e.contribution_weight,0);
   return weight?round(sum/weight*100)/100:null;
  });
  const qualityCounts={
   address_number_clues:usable.filter(e=>e.reference_quality==="number_number").length,
   town_level_clues:usable.filter(e=>e.reference_quality==="town_level_involved").length,
   uncomputable_clues:evidence.length-usable.length
  };
  return {candidate_id:candidate.id,
   available_clues:usable.length,advertised_clue_count:conditions.length,
   coverage:conditions.length?round(usable.length/conditions.length):0,
   quality_counts:qualityCounts,reference_location_quality:b?.quality??"missing",
   scenario_scores:{"1":scores[0],"1.3":scores[1],"1.6":scores[2]},
   evidence,observed_validated_routes:0,
   presentation_status:usable.length?"exploratory_order_only":"insufficient_reference_for_order"};
 });
 const applicable=results.filter(x=>x.available_clues>0);
 const scenarioRanks=Object.fromEntries(SCENARIOS.map(f=>[String(f),ranks(results,String(f))]));
 const described=results.map(x=>{
  const rs=SCENARIOS.map(f=>scenarioRanks[String(f)].get(x.candidate_id)).filter(Number.isInteger);
  return {...x,reference_order:rs.length?scenarioRanks[String(focusFactor)].get(x.candidate_id):null,
   scenario_best_rank:rs.length?Math.min(...rs):null,
   scenario_worst_rank:rs.length?Math.max(...rs):null,
   has_order_uncertainty:rs.length?Math.min(...rs)!==Math.max(...rs):true,
   could_be_correct:true,excluded:false,
   warning:x.available_clues===0?"No geographic comparison possible; retained as a candidate.":
    x.quality_counts.town_level_clues>0?
    "Town-chome reference included; large position uncertainty and ordering may change.":
    "Uncalibrated detour factor; route and entrance not verified."};
 }).sort((a,b)=>a.reference_order===null?1:b.reference_order===null?-1:
   a.reference_order-b.reference_order||a.candidate_id.localeCompare(b.candidate_id));
 return {schema_version:"app023-hibari-partial-evidence-exploration-v0.1",
  ranking_kind:"uncalibrated_reference_scenario_order_not_route_ranking",
  focus_factor:focusFactor,what_if_factors:SCENARIOS,
  assumed_town_reference_weight:0.25,
  weight_is_not_probability:true,
  no_model_conditions:conditions.length===0,
  used_model_for_candidates:applicable.length,
  retained_candidates:described.length,excluded_candidates:0,
  no_geographic_information_candidates:described.filter(x=>!x.available_clues).map(x=>x.candidate_id),
  numbers_are_probabilities:false,
  source_data_is_public_representative_only:true,
  confidence_level:null,independent_accuracy:null,
  disclaimer:"A provisional investigation order only. 1.0/1.3/1.6 straight-to-walk factors and 0.25 town weight are illustrative uncalibrated assumptions. Missing data is not a mismatch. Never show as property identification or actual walking metres.",
  candidates:described};
}