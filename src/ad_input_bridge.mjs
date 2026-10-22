/**
 * APP-023 P1 -> P2 small public-landmark adapter.
 * P1 advertisement text/JSON is NOT a source for coordinates or answer mappings.
 * P2 comparison may only use candidate IDs and independently verified route rows.
 */
import {reviewInput} from "./input_review.mjs";
import {indexPublicPoiIdentities} from "./public_ad_poi_readiness.mjs";
import {evaluateCandidates} from "./condition_matcher.mjs";

const named=v=>typeof v==="string"&&v.trim().length>0;
const compact=s=>typeof s==="string"?s.normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase():"";
const validMinute=m=>Number.isInteger(m)&&m>=1&&m<=180;
const idOf=(p)=>p.physical_id;
const STATION_ID="seibu-hibarigaoka";
const STATION_ALIASES=new Set(["ひばりヶ丘","ひばりヶ丘駅","ひばりが丘","ひばりが丘駅"]);
const sourceSafe=({adId,sourceTier,origin})=>({origin,advertisement_id:adId??null,source_quality:sourceTier,
  source_url:null,ground_truth_available_to_matcher:false});
function foundation(source,poi){
 const idx=indexPublicPoiIdentities(poi);
 return {schema_version:"app023-ad-conditions-bridge-v0.1",
  scope:"public_named_apartment_buildings_only",source,conditions:[],withheld:[],
  known_poi_names:idx.byAlias.size,uses_geographic_coordinates:false,
  measured_pedestrian_routes:0,can_confirm_building:false,
  safe_for_independent_accuracy:false,index:idx};
}
function accept(out,{placeId,label,minutes,excerpt,sourcePath,referenceType,approxM=null}){
 const index=out.conditions.length;
 out.conditions.push({
  id:"walk_"+index,kind:"walk",place_id:placeId,label,
  min_minutes:minutes,max_minutes:minutes,travel_mode:"walk_only",
  source_field:sourcePath,advertised_excerpt:excerpt,
  reference_type:referenceType,claimed_approx_m:approxM,
  route_observed:false,entrance_verified:false,
  precision:"advertised_minutes_not_observed_route"
 });
}
function hold(out,{field,reason,placeId=null}){
 out.withheld.push({field,reason,place_id:placeId,not_scored:true});
}
function finish(out){
 const {index,...publicReport}=out; // never serialize Map or source registry as answer input
 const groups=new Map();
 for(const c of publicReport.conditions){
  const prev=groups.get(c.place_id);
  if(!prev)groups.set(c.place_id,[c]);else prev.push(c);
 }
 const collisions=[...groups.values()].filter(v=>v.length>1);
 publicReport.duplicate_physical_groups=collisions.length;
 publicReport.ambiguous_walk_groups=collisions.filter(v=>new Set(v.map(x=>x.min_minutes)).size>1).length;
 publicReport.eligible_walking_clues=publicReport.conditions.length;
 publicReport.withheld_clues=publicReport.withheld.length;
 publicReport.quality_note="Name matching and source excerpts are not measured access or route quality.";
 return publicReport;
}
/** Frozen ads are a source review fixture, NOT answer-key training features.
 * Direct page evidence H01-H03 only. Indexed snippets never turn into verified inputs.
 * Station has no verbatim quote, so it stays withheld until explicit text arrives.
 */
export function bridgePrelockedPublicAd(prelock,poi,adId){
 if(prelock?.schema_version!=="app023-real-ad-evidence-prelock-v0.1"||
    prelock.cohort_id!=="hibarigaoka-20261021"||
    !Array.isArray(prelock.advertisements)||!named(adId))
  throw Error("Unexpected frozen public ad source");
 const ad=prelock.advertisements.find(a=>a.ad_id===adId);
 if(!ad)throw Error("Unknown prelocked ad");
 const direct=ad.listing?.source_tier==="direct_page_read";
 const out=foundation(sourceSafe({adId,sourceTier:direct?"direct_page_excerpt":"index_excerpt_unverified",origin:"prelocked"}),
  poi);
 if(!direct){
  hold(out,{field:"station",reason:"index_only_advertisement"});
  ad.facilities.forEach((_,i)=>hold(out,{field:"facilities["+i+"]",reason:"index_only_advertisement"}));
  return finish(out);
 }
 // The transport section is recorded, but its verbatim source sentence is absent.
 hold(out,{field:"station.walk_minutes",reason:"missing_station_verbatim_excerpt"});
 for(const [i,clue] of ad.facilities.entries()){
  const field="facilities["+i+"]",p=out.index.byAlias.get(compact(clue.name));
  if(!clue.usable_for_first_pass){hold(out,{field,reason:"published_clue_quarantined",placeId:p?.physical_id});continue;}
  if(!p){hold(out,{field,reason:"named_public_facility_not_in_registry"});continue;}
  const excerpt=clue.source_excerpt;
  const mentionsFacility=p.aliases.some(alias=>compact(excerpt).includes(compact(alias)));
  if(!named(excerpt)||!mentionsFacility||!validMinute(clue.walk_minutes)||
     !Number.isFinite(clue.approx_distance_m)||clue.approx_distance_m<0||
     // Only consistent advertised 80m/min numbers are preliminarily mapped.
     Math.ceil(clue.approx_distance_m/80)!==clue.walk_minutes){
    hold(out,{field,reason:"unverified_quote_or_inconsistent_minutes",placeId:idOf(p)});continue;
  }
  accept(out,{placeId:idOf(p),label:p.official_name,minutes:clue.walk_minutes,
   excerpt,sourcePath:field,referenceType:"published_poi_excerpt_direct_page",
   approxM:clue.approx_distance_m});
 }
 return finish(out);
}
/** Human-pasted public-ad lines. Exact named POI alias at line START only,
 * plus a narrowly named Hibarigaoka station. No fuzzy matching, no guessed
 * walking minutes from standalone meter values, no back-calculated units.
 */
export function bridgePastedPublicText(originalText,poi){
 if(typeof originalText!=="string"||originalText.length>200000)throw Error("Invalid pasted text size");
 const out=foundation(sourceSafe({sourceTier:"user_pasted_unverified",origin:"pasted_text"}),poi);
 const lines=originalText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>100)throw Error("Too many source lines");
 for(const [i,line] of lines.entries()){
  if(line.length>1000){hold(out,{field:"line:"+i,reason:"line_too_long"});continue;}
  const normalized=compact(line);
  const names=[...out.index.byAlias.entries()].filter(([a])=>normalized.startsWith(a));
  const unique=[...new Set(names.map(([,p])=>p.physical_id))];
  // Never bind a compound line to the convenient first POI alias.
  const anywhere=[...new Set([...out.index.byAlias.entries()]
    .filter(([alias])=>normalized.includes(alias)).map(([,p])=>p.physical_id))];
  if(anywhere.length>1){
   hold(out,{field:"line:"+i,reason:"multiple_physical_pois_in_line"});continue;
  }
  const isStation=unique.length===0&&
    /^(?:(?:西武池袋線|西武鉄道)[「『]?)?ひばり[ヶが]丘(?:[」』])?駅?.{0,6}徒歩\d{1,3}分/u.test(normalized);
  if(unique.length===0&&!isStation){
   if(/(?:徒歩\d+分|約\d+m)/.test(normalized))
    hold(out,{field:"line:"+i,reason:"no_exact_public_place_name"});
   continue;
  }
  if(unique.length>1){hold(out,{field:"line:"+i,reason:"multiple_physical_pois_in_line"});continue;}
  const match=normalized.match(/徒歩(\d{1,3})分/),minutes=match?Number(match[1]):null;
  const approx=normalized.match(/(?:約|およそ)(\d{1,5})m/i);
  const meters=approx?Number(approx[1]):null;
  if(!validMinute(minutes)){
   hold(out,{field:"line:"+i,reason:"walk_minute_not_explicit",placeId:unique[0]??null});continue;
  }
  if(meters!==null&&Math.ceil(meters/80)!==minutes){
   hold(out,{field:"line:"+i,reason:"distance_and_minutes_inconsistent",placeId:unique[0]??null});continue;
  }
  const poiMatch=names.find(([,p])=>p.physical_id===unique[0])?.[1];
  accept(out,{placeId:isStation?"station:"+STATION_ID:poiMatch.physical_id,
   label:isStation?"ひばりヶ丘駅":poiMatch.official_name,minutes,excerpt:line,
   sourcePath:"line:"+i,referenceType:"user_pasted_explicit_not_independently_verified",
   approxM:meters});
 }
 return finish(out);
}
/** JSON v0.2 remains reviewed by existing P1 validator; only explicit
 * excerpts that appear in actually pasted source text may become clauses.
 */
export function bridgeReviewedJson(raw,originalText,poi){
 const checked=reviewInput(raw,originalText);
 if(!checked.valid)throw Error("P1 input validation failed: "+checked.errors.join("; "));
 const doc=checked.data;
 const out=foundation(sourceSafe({sourceTier:"user_json_explicit_excerpts",origin:"reviewed_json"}),poi);
 const evidence=doc.evidence;
 const fieldIndex=new Map();
 for(const e of evidence)if(e.kind==="explicit"&&named(e.verbatim_excerpt)&&
     named(originalText)&&originalText.includes(e.verbatim_excerpt)){
  if(!fieldIndex.has(e.field_path))fieldIndex.set(e.field_path,[]);
  fieldIndex.get(e.field_path).push(e.verbatim_excerpt);
 }
 const add=(row,type,i)=>{
  const field="listing."+(type==="station"?"stations":"nearby")+"["+i+"].walk_minutes";
  const quotes=fieldIndex.get(field)||[];
  let placeId,label;
  if(type==="station"){
   if(!STATION_ALIASES.has(compact(row.name||""))){
    hold(out,{field,reason:"station_not_in_fixed_public_registry"});return;
   }
   placeId="station:"+STATION_ID;label="ひばりヶ丘駅";
  }else{
   const p=out.index.byAlias.get(compact(row.name));
   if(!p||row.kind!=="named_place"){
    hold(out,{field,reason:"nearby_place_not_exactly_named"});return;
   }
   placeId=p.physical_id;label=p.official_name;
  }
  if(!validMinute(row.walk_minutes)||row.qualifier!=="exact_advertised"||
     (type==="station"&&row.travel_mode!=="walk_only")||
     quotes.length!==1){
   hold(out,{field,reason:"explicit_source_or_exact_walk_not_verified",placeId});return;
  }
  const quote=quotes[0],q=compact(quote);
  if(!q.includes(compact(row.name))||!q.includes("徒歩"+row.walk_minutes+"分")){
   hold(out,{field,reason:"quote_does_not_support_claim",placeId});return;
  }
  accept(out,{placeId,label,minutes:row.walk_minutes,excerpt:quote,sourcePath:field,
   referenceType:"v0.2_p1_validated_quote_from_pasted_text"});
 };
 doc.listing.stations.forEach((row,i)=>add(row,"station",i));
 doc.listing.nearby.forEach((row,i)=>add(row,"facility",i));
 return finish(out);
}
/** Public building candidates are a separate registry; no answer/mapping,
 * property name, exact address or property URL is copied into P2 input.
 * Unknown/missing routes remain missing and the existing matcher abstains.
 */
export function compareBridgeAgainstPublicCandidates(bridge,buildings){
 if(bridge?.schema_version!=="app023-ad-conditions-bridge-v0.1"||
    bridge.scope!=="public_named_apartment_buildings_only"||
    buildings?.schema_version!=="app023-public-building-address-sources-v0.1"||
    !Array.isArray(buildings.buildings)||buildings.buildings.length!==7)
  throw Error("Invalid bridge or public-building registry");
 const conditions=bridge.conditions.map(c=>({
  id:c.id,kind:"walk",place_id:c.place_id,label:c.label+" 徒歩"+c.min_minutes+"分",
  min_minutes:c.min_minutes,max_minutes:c.max_minutes,travel_mode:"walk_only"
 }));
 // Only anonymous public candidate IDs: no secret/ad name or location leakage.
 const scenario={schema_version:"comparison-v0.1",dataset_kind:"public_named_complex",
  conditions,candidates:buildings.buildings.map(b=>({
    id:b.candidate_id,label:"公開候補 "+b.candidate_id,distances:[],attributes:{}
  }))};
 const result=conditions.length?evaluateCandidates(scenario):null;
 return {bridge_status:conditions.length?"unmeasured_conditions_ready_for_routes":"no_valid_conditions",
  comparison:result,conditions_passed:conditions.length,
  candidate_count:scenario.candidates.length,
  observed_route_count:0,can_confirm_property:false,
  independent_accuracy:null,scenario};
}
