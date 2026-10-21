/** APP-023: source/POI readiness gate for PUBLICLY advertised named buildings.
 * This module intentionally performs NO geocoding, scoring, or route synthesis.
 * An identity match never implies a surveyed facility entrance.
 */
const hasText=s=>typeof s==="string"&&s.trim().length>0;
const publicUrl=s=>typeof s==="string"&&/^https:\/\//.test(s);
const key=s=>typeof s==="string"?s.normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase():"";
const fail=message=>{throw Error(message);};

export function indexPublicPoiIdentities(ledger){
 if(ledger?.schema_version!=="app023-poi-identity-ledger-v0.1"||
    !Array.isArray(ledger.facilities)||ledger.facilities.length<1||ledger.facilities.length>100)
   fail("Invalid POI identity ledger");
 const byAlias=new Map(),physicalIds=new Set(),byPhysical=new Map();
 for(const facility of ledger.facilities){
   if(!facility||!hasText(facility.physical_id)||!hasText(facility.id)||
      !hasText(facility.official_name)||!hasText(facility.public_address)||
      !hasText(facility.category)||!publicUrl(facility.source_url)||
      !Array.isArray(facility.aliases)||facility.aliases.length<1||
      facility.coordinate_status!=="not_independently_verified"||
      facility.entrance_status!=="not_independently_verified"||
      ("lat" in facility)||("lon" in facility))
     fail("POI source or geometry must not be invented");
   if(physicalIds.has(facility.physical_id))fail("Duplicate physical POI");
   physicalIds.add(facility.physical_id);byPhysical.set(facility.physical_id,facility);
   for(const alias of facility.aliases){
     const normalized=key(alias);
     if(!normalized)fail("Blank POI alias");
     const prev=byAlias.get(normalized);
     if(prev&&prev.physical_id!==facility.physical_id)fail("Conflicting POI aliases");
     byAlias.set(normalized,facility);
   }
   if(byAlias.get(key(facility.official_name))?.physical_id!==facility.physical_id)
     fail("Official POI name missing from its aliases");
 }
 return {byAlias,byPhysical};
}
export function auditPublishedAdPoiReadiness(prelock,ledger){
 if(prelock?.schema_version!=="app023-real-ad-evidence-prelock-v0.1"||
    !Array.isArray(prelock.advertisements)||prelock.advertisements.length<1)
    fail("Invalid published ad prelock");
 const {byAlias,byPhysical}=indexPublicPoiIdentities(ledger);
 const adIds=new Set(),activeIds=new Set(),rows=[];
 let directAds=0,indexedAds=0,quarantined=0,sourceReady=0,preliminary=0;
 for(const ad of prelock.advertisements){
   if(!hasText(ad?.ad_id)||adIds.has(ad.ad_id)||
      !Array.isArray(ad.facilities)||!hasText(ad.station?.name)||
      !Number.isInteger(ad.station?.walk_minutes)||ad.station.walk_minutes<1||
      !["direct_page_read","indexed_search_excerpt_direct_403"].includes(ad.listing?.source_tier))
     fail("Invalid or duplicate advertised condition");
   adIds.add(ad.ad_id);
   const sourceVerified=ad.listing.source_tier==="direct_page_read";
   if(sourceVerified)directAds++;else indexedAds++;
   for(const clue of ad.facilities){
     if(!hasText(clue?.name)||!Number.isFinite(clue.approx_distance_m)||
        clue.approx_distance_m<0||typeof clue.usable_for_first_pass!=="boolean")
       fail("Invalid advertisement POI clue");
     const matched=byAlias.get(key(clue.name));
     const plausible=clue.usable_for_first_pass;
     if(plausible)preliminary++;else quarantined++;
     if(plausible&&sourceVerified)sourceReady++;
     if(plausible&&matched)activeIds.add(matched.physical_id);
     const blockers=[];
     if(!plausible)blockers.push("advertised_distance_or_method_quarantined");
     if(!sourceVerified)blockers.push("ad_source_index_only");
     if(!matched)blockers.push("poi_name_not_confirmed");
     else {
       blockers.push("poi_coordinate_not_verified");
       blockers.push("poi_access_point_not_verified");
     }
     blockers.push("walking_route_not_observed");
     rows.push({
       advertisement_id:ad.ad_id,
       clue_name:clue.name,
       physical_id:matched?.physical_id??null,
       official_poi_source:matched?.source_url??null,
       approximate_advertised_m:clue.approx_distance_m,
       advertised_walk_minutes:clue.walk_minutes,
       source_status:sourceVerified?"direct_page":"indexed_excerpt",
       method_status:plausible?"preliminary_only":"quarantined",
       blockers,
       ready_for_scoring:false
     });
   }
 }
 const active=[...activeIds].sort();
 return {
   cohort_id:prelock.cohort_id,
   public_advertisements:adIds.size,
   direct_page_ads:directAds,
   index_only_ads:indexedAds,
   facility_clues:rows.length,
   preliminary_valid_clues:preliminary,
   quarantined_clues:quarantined,
   direct_source_preliminary_clues:sourceReady,
   official_name_matches:rows.filter(x=>x.physical_id!==null).length,
   unique_official_pois:byPhysical.size,
   unique_active_physical_pois:active.length,
   active_physical_poi_ids:active,
   /** Planning counts only. No observations of pedestrian routes have been made. */
   potential_station_candidate_pairs:adIds.size,
   potential_facility_candidate_pairs:adIds.size*active.length,
   observed_new_routes:0,
   scoring_ready:false,
   independent_accuracy:null,
   rows
 };
}
