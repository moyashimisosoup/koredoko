/** APP-023: location evidence collection plan, not a ranking engine.
 * Address-geocoded points are reference points ONLY. A facility identity, an
 * address point, or a route request is never a measured/surveyed entrance.
 */
const okString=s=>typeof s==="string"&&s.trim().length>0;
const isNumber=n=>typeof n==="number"&&Number.isFinite(n);
const fail=s=>{throw Error(s);};
const normalize=s=>(s??"").normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase();
export const GSI_SEARCH_ENDPOINT="https://msearch.gsi.go.jp/address-search/AddressSearch";

/** Public building addresses and PUBLIC facilities are kept separate from the
 * frozen ad feature input; no known correct ad->candidate key may be added. */
export function buildHibariGeocodeManifest(buildings,pois,{directOnly=true}={}){
 if(buildings?.schema_version!=="app023-public-building-address-sources-v0.1"||
    pois?.schema_version!=="app023-poi-identity-ledger-v0.1")
   fail("Invalid source-only address ledgers");
 if(buildings.buildings.length!==7||pois.facilities.length!==10)fail("Unexpected public cohort counts");
 const requests=[],ids=new Set();
 function add(key,address,url,kind){
  if(ids.has(key)||!okString(address)||!/^https:\/\//.test(url||""))fail("Invalid geocode candidate");
  ids.add(key);
  requests.push({key,kind,query_address:address,source_url:url,
   gsi_url:GSI_SEARCH_ENDPOINT+"?q="+encodeURIComponent(address),
   coordinate:null,point_status:"not_requested",access_point_verified:false,
   usage:"research_reference_only_never_assert_entrance"});
 }
 for(const b of buildings.buildings)add("building:"+b.candidate_id,b.public_building_address,b.source_url,"public_building_address");
 add("station:"+buildings.station.place_id,buildings.station.address,buildings.station.source_url,"station_address");
 const directIds=new Set(["hibarigaoka-park","nakahara-elementary","hibarigaoka-post-office","hibarigaoka-parco","seiyu-hibarigaoka"]);
 for(const f of pois.facilities){
  if(directOnly&&!directIds.has(f.id))continue;
  add("facility:"+f.physical_id,f.public_address,f.source_url,"public_facility_address");
 }
 return {schema_version:"app023-geocode-manifest-v0.1",cohort_id:buildings.cohort_id,
  mode:directOnly?"direct_ads_priority":"all_ten_official_pois",
  status:"unqueried_references",requests};
}

/** Never claim "verified" based on GSI search. It often drops house number:
 * array returned by GSI is a candidate set, not independently surveyed doors. */
export function interpretGsiAddressFeatures(request,features){
 if(!request?.query_address||!request?.key)fail("Unknown request");
 if(!Array.isArray(features))return {key:request.key,status:"invalid_response",candidates:[],geocoded:false,access_point_verified:false};
 const options=[];
 for(const feature of features.slice(0,25)){
  const coords=feature?.geometry?.coordinates,title=feature?.properties?.title;
  if(!Array.isArray(coords)||coords.length<2||!isNumber(coords[0])||!isNumber(coords[1])||
     coords[0]<122||coords[0]>154||coords[1]<20||coords[1]>46||!okString(title))continue;
  // Municipal boundary guard, not a matching threshold.
  if(!normalize(title).includes("西東京市"))continue;
  options.push({lon:coords[0],lat:coords[1],resolved_title:title,coordinate_kind:"GSI_address_search_reference"});
 }
 return {key:request.key,status:options.length?"candidate_points_need_manual_review":"no_valid_local_reference",
  candidates:options,geocoded:options.length>0,
  access_point_verified:false,route_input_ready:false,
  notice:"No building/station/park/school entrance implied by a geocoded address."};
}

/** Number of UNIQUE destination comparisons, not route API results. All source
 * evidence about candidate building locations is excluded from ad features. */
export function buildHibariRouteCoverage(ads,pois,buildings,{directOnly=true}={}){
 if(ads?.schema_version!=="app023-real-ad-evidence-prelock-v0.1"||
    pois?.schema_version!=="app023-poi-identity-ledger-v0.1"||
    buildings?.schema_version!=="app023-public-building-address-sources-v0.1")
  fail("Invalid locked cohort input");
 const candidates=buildings.buildings.map(x=>x.candidate_id),validNames=new Set();
 if(candidates.length!==7||new Set(candidates).size!==7)fail("Invalid candidate universe");
 const direct=new Set();
 for(const ad of ads.advertisements){
  if(directOnly&&ad.listing.source_tier!=="direct_page_read")continue;
  for(const f of ad.facilities)if(f.usable_for_first_pass)direct.add(normalize(f.name));
 }
 const selected=pois.facilities.filter(p=>!directOnly||p.aliases.some(a=>direct.has(normalize(a))));
 // In all-source mode, only POIs associated with unquarantined ad clues count.
 const allActive=new Set();
 if(!directOnly)for(const ad of ads.advertisements)for(const clue of ad.facilities)
  if(clue.usable_for_first_pass)allActive.add(normalize(clue.name));
 const destinations=(directOnly?selected:pois.facilities.filter(p=>p.aliases.some(a=>allActive.has(normalize(a)))))
   .map(p=>({destination_key:"facility:"+p.physical_id,kind:"facility",name:p.official_name}));
 destinations.unshift({destination_key:"station:"+buildings.station.place_id,kind:"station",name:buildings.station.name});
 for(const d of destinations)if(validNames.has(d.destination_key))fail("Duplicate destination");
 else validNames.add(d.destination_key);
 const routes=candidates.flatMap(id=>destinations.map(d=>({
   candidate_id:id,destination_key:d.destination_key,destination_kind:d.kind,
   meters:null,snap_start_m:null,snap_end_m:null,coordinate_source_status:"not_independently_verified",
   observed:false,status:"requires_reviewed_reference_points",eligible_for_scoring:false
 })));
 return {schema_version:"app023-route-coverage-v0.1",cohort_id:ads.cohort_id,
   source_ads:directOnly?"direct_3_only":"all_7_source_tiers_retained",
   candidate_count:candidates.length,destination_count:destinations.length,
   expected_route_pairs:routes.length,observed_route_pairs:0,
   routable_pairs:0,scoring_ready:false,access_points_verified:false,
   destinations,routes};
}
