import {parseNishitokyoBlock} from "./hibari_offline_isj_match.mjs";

/** Geolonia v2 public address-number points are NEVER surveyed entrances.
 * Address "2番53号" = residence block 2, number 53, not building door.
 */
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const numberMatch=address=>{
 const parsed=parseNishitokyoBlock(address);
 if(!parsed)return null;
 const m=address.normalize("NFKC").match(/丁目[ -]?(\d+)番(?:地)?[ -]?(\d+)号?/);
 return {...parsed,number:m?Number(m[2]):null};
};
const haversine=(a,b)=>{
 const toRad=Math.PI/180;
 const dlat=(b.latitude-a.latitude)*toRad,dlon=(b.longitude-a.longitude)*toRad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*toRad)*Math.cos(b.latitude*toRad)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};
const str=s=>typeof s==="string"&&s.trim().length>0;
const validPoint=p=>p&&finite(p.latitude)&&finite(p.longitude)&&p.latitude>=35.5&&p.latitude<=36&&p.longitude>=139.3&&p.longitude<=139.8;
const validateReference=r=>{
 if(!r||!str(r.target_id)||!str(r.target_type)||!str(r.normalized_town)||
    !Number.isInteger(r.requested_block)||r.requested_block<1||!Number.isInteger(r.block_record_count)||r.block_record_count<0||
    !Number.isInteger(r.source_row_matches)||r.source_row_matches<0||
    !["address_number_unique","exact_number_absent","address_only_block","ambiguous_or_extended_number","address_parse_failed"].includes(r.status)||
    r.entrance_verified!==false||r.route_measured!==false||r.can_establish_correct_building!==false)
  throw Error("Corrupted v2 public-address reference");
 if(r.status==="address_number_unique"){
  if(!Number.isInteger(r.requested_number)||r.requested_number<1||
    r.source_row_matches!==1||!validPoint(r.point)||
    r.point.coordinate_kind!=="public_residence_display_number_reference_not_entrance"||
    r.source_row?.blk_num!==r.requested_block||
    r.source_row?.rsdt_num!==r.requested_number||
    r.source_row?.rsdt_num2!=="")
    throw Error("Invalid address-number match evidence");
 }else if(r.point!==null)throw Error("Nonmatching address cannot contain location point");
};
export function auditHibariV2NumberReferences(snapshot,buildings,pois){
 if(snapshot?.schema_version!=="app023-geolonia-v2-address-number-references-v0.1"||
    snapshot.license!=="CC BY 4.0"||snapshot.source_endpoint_version!=="unpinned_public_service"||
    snapshot.router_use_authorized!==false||
    snapshot.source_residence_record_count!==41807||
    snapshot.source_meta_updated_unix!==1735102670||
    !Array.isArray(snapshot.references)||snapshot.references.length!==18||
    !snapshot.source_residence_url?.startsWith("https://japanese-addresses-v2.geoloniamaps.com/api/ja/"))
   throw Error("Unexpected source or prohibited routing");
 if(buildings?.schema_version!=="app023-public-building-address-sources-v0.1"||
    pois?.schema_version!=="app023-poi-identity-ledger-v0.1")
  throw Error("Unexpected target ledgers");
 const targets=[
  ...buildings.buildings.map(b=>({id:"building:"+b.candidate_id,address:b.public_building_address})),
  {id:"station:"+buildings.station.place_id,address:buildings.station.address},
  ...pois.facilities.map(p=>({id:"facility:"+p.physical_id,address:p.public_address}))
 ];
 const index=new Map(snapshot.references.map(r=>[r.target_id,r]));
 if(index.size!==18)throw Error("Duplicate target reference IDs");
 const comparisons=targets.map(t=>{
  const ref=index.get(t.id);
  if(!ref)throw Error("Missing public target reference");
  validateReference(ref);
  const p=numberMatch(t.address);
  if(!p||ref.requested_block!==p.block||
    ref.normalized_town!==p.town+p.chome+"丁目"||
    ref.requested_number!==p.number)
   throw Error("Public-address source no longer matches frozen input");
  const delta=ref.point&&validPoint(ref.legacy_town_reference)?
   Math.round(haversine(ref.point,ref.legacy_town_reference)):null;
  return {target_id:t.id,status:ref.status,source_row_matches:ref.source_row_matches,
   reference_point:ref.point,compared_to_legacy_town_point_m:delta,
   matching_house_number:ref.status==="address_number_unique",
   audited_public_entrance:false,route_ready:false,ranking_ready:false};
 });
 const matched=comparisons.filter(x=>x.matching_house_number);
 const shifts=matched.map(x=>x.compared_to_legacy_town_point_m).filter(finite).sort((a,b)=>a-b);
 return {schema_version:"app023-v2-public-address-audit-v0.1",
  cohort_id:snapshot.cohort_id,source_url:snapshot.source_residence_url,
  source_updated_at:snapshot.source_meta_updated_utc,
  source_attribution:"Geolonia 住所データ v2（CC BY 4.0）。原データ: デジタル庁アドレス・ベース・レジストリ。",
  address_targets:comparisons.length,number_matched_targets:matched.length,
  number_not_found:comparisons.filter(x=>x.status==="exact_number_absent").length,
  block_only_addresses:comparisons.filter(x=>x.status==="address_only_block").length,
  minimum_shift_from_town_reference_m:shifts[0]??null,
  maximum_shift_from_town_reference_m:shifts.at(-1)??null,
  median_shift_from_town_reference_m:shifts.length?shifts[Math.floor(shifts.length/2)]:null,
  shift_meaning:"Difference between two reference sources; NOT error versus a verified entrance.",
  public_entrances_verified:0,new_pedestrian_routes_observed:0,
  any_route_scoring_authorized:false,independent_accuracy:null,
  rows:comparisons};
}