import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeAreaLandmarks,parseAreaInput,solveSearchArea} from "../src/area_overlap_solver.mjs";
import {extractUnmatchedFacilityName,buildOpenPoiSearchUrl,vetOpenPoiSearchResponse,
 findUnresolvedNames,enrichWithOpenPoi} from "../src/openpoi_facility_matcher.mjs";
const file=name=>JSON.parse(readFileSync(new URL("../examples/"+name,import.meta.url),"utf8"));
function initial(text){
 const pois=file("hibari_poi_identities_20261021.json"),
  refs=file("hibari_geolonia_v2_address_number_20261022.json"),
  towns=file("hibari_geolonia_town_chome_references_20261022.json");
 const landmarks=makeAreaLandmarks(pois,refs,towns);
 return parseAreaInput(text,landmarks,towns.records);
}
const text="西東京市 谷戸町三丁目\nひばりが丘PARCO 徒歩3分\nサミットストア西東京店 徒歩4分";
const center={lon:139.543,lat:35.75};
const exact={name:"サミットストア西東京店",address:"東京都西東京市〇〇",lat:35.7495,lng:139.545,
 source:"overture",category:"grocery",level:null,licenses:["CDLA-Permissive-2.0"],
 attributions:["Overture Maps Foundation, overturemaps.org"]};
test("unregistered public POI extraction never queries whole advertisement or unnamed facility",()=>{
 assert.equal(extractUnmatchedFacilityName("サミットストア西東京店：徒歩4分"),"サミットストア西東京店");
 assert.equal(extractUnmatchedFacilityName("スーパーまで徒歩4分"),null);
 assert.equal(extractUnmatchedFacilityName("谷戸町三丁目 物件 徒歩3分"),null);
 assert.equal(extractUnmatchedFacilityName("マイホーム 3丁目2番地 徒歩3分"),null);
 const parsed=initial(text);
 assert.equal(parsed.constraints.length,1);
 assert.equal(findUnresolvedNames(text,parsed).length,1);
 assert.equal(findUnresolvedNames(text,parsed)[0].name,"サミットストア西東京店");
});
test("OpenPOI search is one POI name, local center in LONGITUDE,LATITUDE order, bounded radius",()=>{
 const url=new URL(buildOpenPoiSearchUrl("サミットストア西東京店",center));
 assert.equal(url.origin,"https://api.openpoiapi.com");
 assert.equal(url.pathname,"/v1/search");
 assert.equal(url.searchParams.get("q"),"サミットストア西東京店");
 assert.equal(url.searchParams.get("center"),"139.543000,35.750000");
 assert.equal(url.searchParams.get("radius"),"6000");
 assert.equal(url.searchParams.get("limit"),"15");
 assert.ok(!url.href.includes("谷戸町"));
});
test("strict exact-name regional result is accepted with source provenance, never entrance proof",()=>{
 const selected=vetOpenPoiSearchResponse({results:[exact]},exact.name,center);
 assert.equal(selected.status,"single_regional_match");
 assert.equal(selected.match.precision,"openpoi_public_poi_reference_unverified_entrance");
 assert.equal(selected.match.identity_status,"name_plus_region_only");
 assert.deepEqual(selected.match.licenses,["CDLA-Permissive-2.0"]);
 assert.deepEqual(selected.match.attributions,["Overture Maps Foundation, overturemaps.org"]);
 assert.equal(selected.match.location.lat,35.7495);
});
test("overlapping same-place duplicate records do not turn into independent proof",()=>{
 const v=vetOpenPoiSearchResponse({results:[exact,{...exact,lat:35.7496,lng:139.5451,source:"jff"}]},exact.name,center);
 assert.equal(v.status,"single_regional_match");
 assert.equal(v.matched_count,2);
});
test("ambiguous same-name locations are withheld instead of silently picking nearest",()=>{
 const v=vetOpenPoiSearchResponse({results:[exact,{...exact,lat:35.7580,lng:139.551}]},exact.name,center);
 assert.equal(v.status,"ambiguous_same_named_locations");
 assert.equal(v.match,null);
});
test("out-of-region, incomplete name, bogus coords, and prefecture-only coordinates never accepted",()=>{
 const v=vetOpenPoiSearchResponse({results:[
  {...exact,lat:35.9}, {...exact,name:"サミットストア別店舗"},
  {...exact,lat:"",lng:""}, {...exact,level:1}
 ]},exact.name,center);
 assert.equal(v.status,"no_exact_regional_match");
});
test("POI fallback adds one clue without exposing raw ad or known building names to API",async()=>{
 let requests=[];
 const result=await enrichWithOpenPoi(text,initial(text),{fetchImpl:async(url,options)=>{
  requests.push({url,options});return {ok:true,json:async()=>({results:[exact]})};
 }});
 assert.equal(requests.length,1);
 assert.equal(result.added_constraints,1);
 assert.equal(result.parsed.constraints.length,2);
 assert.equal(result.parsed.ignored.length,0);
 assert.equal(result.parsed.constraints[1].source_line,3);
 assert.equal(result.parsed.constraints[1].stated_minutes,4);
 assert.equal(result.parsed.constraints[1].stated_meters,null);
 assert.equal(result.parsed.constraints[1].poi_source,"openpoi");
 assert.equal(result.parsed.constraints[1].precision,"openpoi_public_poi_reference_unverified_entrance");
 assert.equal(new URL(requests[0].url).searchParams.get("q"),"サミットストア西東京店");
 assert.ok(!requests[0].url.includes("ひばりが丘PARCO"));
 assert.ok(!requests[0].url.includes("谷戸町"));
 const area=solveSearchArea(result.parsed);
 assert.equal(area.state,"exploratory_areas");
 assert.equal(area.clues_used,2);
 assert.equal(area.center_point,null);
 assert.equal(area.property_candidates,null);
});
test("429 errors and CORS rejection preserve offline results and unresolved condition",async()=>{
 for(const mock of [async()=>({ok:false,status:429}),async()=>{throw Error("CORS blocked")} ]){
  const parsed=initial(text);
  const result=await enrichWithOpenPoi(text,parsed,{fetchImpl:mock});
  assert.equal(result.parsed.constraints.length,1);
  assert.equal(result.parsed.ignored.length,1);
  assert.equal(result.lookups[0].status,"api_unavailable_or_rate_limited");
 }
});
test("without regional information even exact same-name record must not auto-match nationwide",async()=>{
 let called=0;
 const t="サミットストア西東京店 徒歩4分";
 const result=await enrichWithOpenPoi(t,initial(t),{fetchImpl:async()=>{called++;throw Error("should not call")}});
 assert.equal(called,0);
 assert.equal(result.state,"regional_context_missing");
 assert.equal(result.parsed.constraints.length,0);
});

test("OpenPOI level 3 (town/chome) record remains coarse, never promoted to an exact facility coordinate",()=>{
 const v=vetOpenPoiSearchResponse({results:[{...exact,level:3}]},exact.name,center);
 assert.equal(v.status,"single_regional_match");
 assert.equal(v.match.precision,"town_chome_reference");
});

test("G2 live: two identically named post offices are disambiguated ONLY by separate public address-number evidence",()=>{
 const ref=getPublicPostOfficeRef();
 const live={results:[
  {name:"ひばりが丘郵便局",category:"finance",lat:35.749564224233985,lng:139.54440370202065,source:"overture",level:""},
  {name:"ひばりが丘郵便局",category:"finance",lat:35.7463278,lng:139.5476222,source:"overture",level:""}
 ]};
 assert.equal(vetOpenPoiSearchResponse(live,"ひばりが丘郵便局",center).status,"ambiguous_same_named_locations");
 assert.equal(ref.precision,"address_number_reference");
 const r=vetOpenPoiSearchResponse(live,"ひばりが丘郵便局",center,
  {referenceLocation:ref.location,referencePrecision:ref.precision});
 assert.equal(r.status,"single_independently_referenced_match");
 assert.equal(r.matched_count,2);
 assert.equal(r.match.location.lat,35.749564224233985);
 assert.equal(r.match.identity_status,"exact_name_plus_independent_public_address_reference");
 assert.notEqual(r.match.precision,"verified_facility_entrance");
});
function getPublicPostOfficeRef(){
 const pois=file("hibari_poi_identities_20261021.json"),
  refs=file("hibari_geolonia_v2_address_number_20261022.json"),
  towns=file("hibari_geolonia_town_chome_references_20261022.json");
 return makeAreaLandmarks(pois,refs,towns).find(x=>x.name==="ひばりが丘郵便局");
}
test("G2 live: store tenants never become PARCO or SEIYU building landmarks by substring",()=>{
 const parco={results:[{name:"食堂いつもの。",lat:35.751767586,lng:139.544568083,category:"restaurant",source:"jff",level:8}]};
 const seiyu={results:[
  {name:"ドトールコーヒーショップ　西友ひばりヶ丘店",lat:35.750781508,lng:139.544867192,category:"restaurant"},
  {name:"ニトリ",lat:35.750796,lng:139.545244,category:"retail_other"},
  {name:"占い館 魔女☆Maison 西友ひばりヶ丘店",lat:35.75098243,lng:139.5451583,category:"tourism"}
 ]};
 assert.equal(vetOpenPoiSearchResponse(parco,"ひばりが丘PARCO",center).status,"no_exact_regional_match");
 assert.equal(vetOpenPoiSearchResponse(seiyu,"西友ひばりヶ丘店",center).status,"no_exact_regional_match");
});
test("a mismatching address reference cannot force an exact-name facility match",()=>{
 const location={lat:35.732,lon:139.51};
 const x=vetOpenPoiSearchResponse({results:[{name:"ひばりが丘郵便局",lat:35.749564224233985,lng:139.54440370202065}]},
  "ひばりが丘郵便局",center,
  {referenceLocation:location,referencePrecision:"address_number_reference"});
 assert.equal(x.status,"reference_coordinate_conflict");
 assert.equal(x.match,null);
 assert.throws(()=>vetOpenPoiSearchResponse({results:[]},
  "ひばりが丘郵便局",center,{referenceLocation:location,referencePrecision:"town_chome_reference"}),
  /public address-number/);
});
