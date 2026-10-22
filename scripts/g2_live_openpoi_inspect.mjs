/** APP-023 G2: single live diagnosis of 3 already-seen OpenPOI public names.
 * Read-only, no private advertisement text, no real estate locations, no new regions.
 */
import {readFileSync} from "node:fs";
import {makeAreaLandmarks} from "../src/area_overlap_solver.mjs";
import {buildOpenPoiSearchUrl,vetOpenPoiSearchResponse} from "../src/openpoi_facility_matcher.mjs";
const get=n=>JSON.parse(readFileSync(new URL("../examples/"+n,import.meta.url),"utf8"));
const pois=get("hibari_poi_identities_20261021.json");
const refs=get("hibari_geolonia_v2_address_number_20261022.json");
const towns=get("hibari_geolonia_town_chome_references_20261022.json");
const all=makeAreaLandmarks(pois,refs,towns);
const center=all.find(x=>x.name==="ひばりが丘郵便局")?.location;
if(!center)throw Error("Public POI reference center unavailable");
const rad=Math.PI/180;
const distance=(a,b)=>Math.round(6371000*2*Math.asin(Math.min(1,Math.sqrt(
 Math.sin((a.lat-b.lat)*rad/2)**2+
 Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((a.lon-b.lon)*rad/2)**2
))));
const audit=[];
for(const name of ["ひばりが丘郵便局","ひばりが丘PARCO","西友ひばりヶ丘店"]){
 const link=buildOpenPoiSearchUrl(name,center);
 const response=await fetch(link,{signal:AbortSignal.timeout(14000)});
 const data=await response.json();
 const current=all.find(x=>x.name===name);
 const candidates=(Array.isArray(data.results)?data.results:[]).slice(0,15).map(p=>{
  const point={lat:Number(p.lat),lon:Number(p.lng)};
  return {name:p.name,category:p.category,level:p.level,source:p.source,
   coordinates_valid:p.lat!==""&&p.lng!==""&&Number.isFinite(point.lat)&&Number.isFinite(point.lon),
   distance_from_reference_m:current?.location&&p.lat!==""&&p.lng!==""?
     distance(point,current.location):null,
   distance_from_region_center_m:p.lat!==""&&p.lng!==""?distance(point,center):null,
   // Public facility coordinates only. No inferred property coordinates.
   lat:p.lat,lng:p.lng};
 });
 audit.push({searched_public_facility:name,http_status:response.status,count:data.count,
  scope:data.scope,vetting:vetOpenPoiSearchResponse(data,name,center).status,
  candidates});
}
console.log("APP023_G2_OPENPOI_LIVE_CANDIDATES="+JSON.stringify(audit));
