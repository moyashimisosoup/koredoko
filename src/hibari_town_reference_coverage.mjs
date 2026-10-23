/** APP-023 source-verified *town-chome* point coverage audit.
 * Data is an upstream published Geolonia representative, NOT a measured
 * entrance, MLIT street block, station exit, or routing endpoint.
 */
import {normalizeJapaneseBlockString,parseNishitokyoBlock} from "./hibari_offline_isj_match.mjs";

function sourceKey(town){
 const name=normalizeJapaneseBlockString(town);
 const match=name.match(/^(.+?)(\d+)丁目$/);
 return match?match[1]+"|"+Number(match[2]):null;
}
function inputKey(addr){
 const match=parseNishitokyoBlock(addr);
 return match?match.town+"|"+match.chome:null;
}
function validateSnapshot(source){
 if(source?.schema_version!=="app023-town-chome-reference-snapshot-v0.1"||
    source.road_routing_allowed!==false||
    source.source_precision!=="town_chome_representative_only"||
    !/^[a-f0-9]{40}$/.test(source.source_commit||"")||
    !source.source_raw_url?.startsWith("https://raw.githubusercontent.com/geolonia/japanese-addresses/")||
    source.license!=="CC BY 4.0"||
    !Array.isArray(source.records)||source.records.length<1||source.records.length>100)
    throw Error("Invalid source snapshot or attribution");
 const index=new Map();
 for(const row of source.records){
  const id=sourceKey(row?.town);
  if(!id||index.has(id)||row.coordinate_kind!=="town_chome_representative_not_building_or_entrance"||
     row.usable_for_walking_route!==false||
     !Number.isFinite(row.lat)||!Number.isFinite(row.lon)||
     row.lat<35.5||row.lat>35.95||row.lon<139.3||row.lon>139.75)
    throw Error("Invalid or duplicate town-level source coordinate");
  index.set(id,row);
 }
 return index;
}
export function auditHibariTownReferenceCoverage(source,buildings,pois){
 const index=validateSnapshot(source);
 if(buildings?.schema_version!=="app023-public-building-address-sources-v0.1"||
    pois?.schema_version!=="app023-poi-identity-ledger-v0.1")
   throw Error("Unexpected source ledgers");
 const endpoints=[
  ...buildings.buildings.map(b=>({id:"building:"+b.candidate_id,type:"public_building",address:b.public_building_address})),
  {id:"station:"+buildings.station.place_id,type:"station",address:buildings.station.address},
  ...pois.facilities.map(p=>({id:"facility:"+p.physical_id,type:"public_facility",address:p.public_address}))
 ];
 if(endpoints.length!==18||new Set(endpoints.map(e=>e.id)).size!==18)
  throw Error("Unexpected public target cohort");
 const group=new Map();
 const rows=endpoints.map(endpoint=>{
  const key=inputKey(endpoint.address),ref=key?index.get(key):null;
  if(ref){
   if(!group.has(key))group.set(key,[]);
   group.get(key).push(endpoint.id);
  }
  return {target_id:endpoint.id,target_type:endpoint.type,reference_town:ref?.town??null,
    reference_lat:ref?.lat??null,reference_lon:ref?.lon??null,
    source_kind:ref?"geolonia_legacy_town_chome":"missing",
    status:ref?"town_chome_reference_found_not_entry_point":"town_chome_reference_missing",
    matched_address_level:ref?"town_chome_only":null,
    matched_street_block:false,matched_house_number:false,
    entrance_verified:false,usable_for_routing:false,usable_for_accuracy_scoring:false};
 });
 const shared=[...group.entries()].filter(([,v])=>v.length>1).map(([key,ids])=>({
   reference_key:key,shared_reference_count:ids.length,target_ids:ids
 }));
 return {
  schema_version:"app023-town-reference-coverage-report-v0.1",
  cohort_id:buildings.cohort_id,
  public_target_count:rows.length,
  town_reference_source_count:index.size,
  matched_town_reference_targets:rows.filter(r=>r.reference_town!==null).length,
  unique_referenced_towns:group.size,
  shared_reference_groups:shared,
  unknown_reference_targets:rows.filter(r=>r.reference_town===null).map(r=>r.target_id),
  coordinate_granularity:"town_chome_only",
  source_url:source.source_raw_url,source_commit:source.source_commit,
  license:source.license,source_data_legacy_unmaintained:true,
  known_public_entrances:0,confirmed_street_blocks:0,
  new_pedestrian_observations:0,routing_ready:false,
  scoring_ready:false,independent_accuracy:null,
  // This can only narrow the quality of candidate geocoding sources,
  // not narrow actual house/building positions.
  note:"Town-chome centroids collapse multiple public destinations to one point. Never pass these representative coordinates to Valhalla or ranking.",
  rows
 };
}