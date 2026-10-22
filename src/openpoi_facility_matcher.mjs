/**
 * APP-023 optional OpenPOI facility matcher.
 * Searches are ONLY made for unmatched explicitly named PUBLIC facilities,
 * never raw advertisement text, partial private addresses or building names.
 * OpenPOI coordinates are facility references, NOT entrances / road distances.
 *
 * API: https://api.openpoiapi.com/v1/search (CORS, keyless, search q OR).
 * Search q is ONE public name at a time; center is lng,lat (in that order).
 */
const nameKey=v=>String(v??"").normalize("NFKC").replace(/[\s\u3000・\-‐–]/g,"").toLowerCase();
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const RADIUS=6000;
const LIMIT=15;
const meters=(a,b)=>{
 const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad;
 const z=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
};
const withinJapan=c=>finite(c?.lat)&&finite(c?.lon)&&c.lat>24&&c.lat<46&&c.lon>122&&c.lon<154;
const strip=s=>String(s).trim().replace(/[：:・.…、，,（）()\s\u3000\-]+$/g,"").replace(/(?:まで|から|より)$/,"").trim();
const safeFacilityName=n=>n.length>=3&&n.length<=60&&
 /(?:駅|公園|郵便局|学校|小学校|中学校|高校|保育園|幼稚園|病院|図書館|スーパー|店|商店|銀行|ドラッグ|薬局|PARCO|パルコ|センター|モール|イオン|セブン|ファミリーマート|ローソン|市役所|区役所)/i.test(n)&&
 !/(?:物件|自宅|個人宅|宅地|地番|所有者|居住者|住宅ローン|〇丁目|番地|号室|\d+丁目)/.test(n);
/** No request for vague generic labels like "スーパー" or "公園". */
export function extractUnmatchedFacilityName(rawLine){
 if(typeof rawLine!=="string"||rawLine.length>500)return null;
 const compact=rawLine.normalize("NFKC");
 const m=compact.match(/^(.*?)(?:徒歩\s*\d{1,3}\s*分|(?:約|およそ)\s*\d{1,5}\s*(?:m|メートル))/i);
 if(!m)return null;
 const prefix=strip(m[1]);
 if(!safeFacilityName(prefix)||/^(?:駅|公園|学校|スーパー|コンビニ|病院|郵便局|ドラッグストア|商業施設|保育園)$/.test(prefix))return null;
 return prefix;
}
export function buildOpenPoiSearchUrl(name,center){
 if(!safeFacilityName(name)||!withinJapan(center))throw Error("Public named POI and regional context required");
 const url=new URL("https://api.openpoiapi.com/v1/search");
 url.searchParams.set("q",name);
 // Coordinates are from PUBLIC landmarks; never the user's current location.
 url.searchParams.set("center",center.lon.toFixed(6)+","+center.lat.toFixed(6));
 url.searchParams.set("radius",String(RADIUS));
 url.searchParams.set("limit",String(LIMIT));
 return url.toString();
}
function searchRecord(v,name,center){
 if(!v||typeof v!=="object"||typeof v.name!=="string"||
    nameKey(v.name)!==nameKey(name))return null;
 const lat=typeof v.lat==="number"?v.lat:Number(v.lat),lon=typeof v.lng==="number"?v.lng:Number(v.lng);
 const location={lat,lon};
 if(!withinJapan(location)||meters(center,location)>RADIUS)return null;
 const level=typeof v.level==="number"?v.level:Number(v.level);
 if(Number.isFinite(level)&&level>0&&level<=2)return null;
 return {name:v.name,location,address:typeof v.address==="string"?v.address:"",
  category:typeof v.category==="string"?v.category:"unknown",
  source:typeof v.source==="string"?v.source:"unreported",
  level:Number.isFinite(level)&&level>0?level:null,
  licenses:Array.isArray(v.licenses)?v.licenses.filter(x=>typeof x==="string"):[],
  attributions:Array.isArray(v.attributions)?v.attributions.filter(x=>typeof x==="string"):[]};
}
/**
 * An automatic match is possible only if the strict name occurs in a single
 * geographic cluster within 150m. Ambiguous same-named POIs are withheld.
 * We NEVER pick the first search result just because it's nearest the center.
 */
export function vetOpenPoiSearchResponse(payload,name,center,{referenceLocation=null,referencePrecision=null}={}){
 if(!payload||!Array.isArray(payload.results)||!withinJapan(center))throw Error("Invalid OpenPOI response");
 if(referenceLocation!==null&&(referencePrecision!=="address_number_reference"||!withinJapan(referenceLocation)))
  throw Error("Independent public address-number reference required");
 const valid=payload.results.map(x=>searchRecord(x,name,center)).filter(Boolean);
 if(valid.length===0)return {status:"no_exact_regional_match",match:null,matched_count:0};
 const groups=[];
 for(const item of valid){
  const g=groups.find(group=>meters(group[0].location,item.location)<=150);
  if(g)g.push(item);else groups.push([item]);
 }
 // A PUBLIC independently sourced ADDRESS-NUMBER reference can disambiguate
 // multiple identically named POIs. Do not use the query center as that
 // reference: it might be a generic town center. Never compare to private
 // property or residents' coordinates; those never reach this function.
 let chosen=groups.length===1?groups[0]:null,matchBasis="exact_name_plus_region";
 if(referenceLocation!==null){
  const near=groups.filter(g=>g.some(x=>meters(x.location,referenceLocation)<=100));
  if(near.length!==1)return {status:near.length===0?"reference_coordinate_conflict":
   "ambiguous_same_named_locations",match:null,matched_count:valid.length};
  chosen=near[0];matchBasis="exact_name_plus_independent_public_address_reference";
 }
 if(!chosen)return {status:"ambiguous_same_named_locations",match:null,matched_count:valid.length};
 const sorted=[...chosen].sort((a,b)=>(b.level??0)-(a.level??0));
 // Keep only the representative POI and its own provenance.
 const p=sorted[0];
 return {status:matchBasis==="exact_name_plus_region"?"single_regional_match":"single_independently_referenced_match",
  matched_count:valid.length,
  match:{...p,precision:p.level===3?"town_chome_reference":"openpoi_public_poi_reference_unverified_entrance",
   identity_status:matchBasis}};
}
export function findUnresolvedNames(input,parsed){
 if(typeof input!=="string"||!Array.isArray(parsed?.ignored))throw Error("Invalid original clue references");
 const lines=input.split(/\r?\n/);
 const refs=[];
 for(const item of parsed.ignored){
  if(item.reason!=="施設名が未登録です"||!Number.isInteger(item.line))continue;
  const line=lines[item.line-1],name=extractUnmatchedFacilityName(line);
  if(name&& !refs.some(p=>p.name===name))refs.push({line:item.line,name,excerpt:line});
 }
 return refs.slice(0,3);
}
function contextFor(parsed){
 const prior=parsed?.partialAddress?.location;
 if(withinJapan(prior))return prior;
 const first=parsed?.constraints?.find(x=>withinJapan(x.location));
 return first?.location??null;
}
/**
 * Uses network only for 1..3 unknown public POI names, never for full ads.
 * If 429/offline/timeout/ambiguous, the constraint stays ignored.
 */
export async function enrichWithOpenPoi(input,parsed,{fetchImpl=fetch}={}){
 const refs=findUnresolvedNames(input,parsed),center=contextFor(parsed),accepted=[],status=[];
 if(!refs.length||!center)
  return {parsed,lookups:[],state:!center?"regional_context_missing":"nothing_to_search"};
 for(const item of refs){
  try{
   const url=buildOpenPoiSearchUrl(item.name,center);
   const response=await fetchImpl(url,{method:"GET",headers:{Accept:"application/json"},
     signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error("HTTP "+response.status);
   const payload=await response.json();
   const match=vetOpenPoiSearchResponse(payload,item.name,center);
   status.push({line:item.line,name:item.name,status:match.status,matched_count:match.matched_count});
   if(match.match){
    const normalized=item.excerpt.normalize("NFKC").replace(/\s/g,"");
    const dist=normalized.match(/(?:約|およそ)?(\d{1,5})(?:m|メートル)/i);
    const walk=normalized.match(/徒歩(\d{1,3})分/);
    const claimed=dist?Number(dist[1]):null,minutes=walk?Number(walk[1]):null;
    if((claimed===null&&minutes===null)||(claimed!==null&&(claimed<1||claimed>10000))||
       (minutes!==null&&(minutes<1||minutes>120)))continue;
    accepted.push({
      landmark_id:"openpoi:"+item.name,label:match.match.name,location:match.match.location,
      precision:"openpoi_public_poi_reference_unverified_entrance",
      stated_meters:claimed,stated_minutes:minutes,
      metric:claimed===null?"walking_minutes":"distance",
      source_line:item.line,quote:item.excerpt,
      conflicting_advertisement_numbers:claimed!==null&&minutes!==null&&Math.ceil(claimed/80)!==minutes,
      poi_source:"openpoi",poi_address:match.match.address,poi_category:match.match.category,
      poi_source_record:match.match.source,licenses:match.match.licenses,attributions:match.match.attributions
    });
   }
  }catch(e){
   status.push({line:item.line,name:item.name,status:"api_unavailable_or_rate_limited",detail:String(e.message).slice(0,100)});
  }
 }
 const acceptedLines=new Set(accepted.map(x=>x.source_line));
 return {parsed:{...parsed,constraints:[...parsed.constraints,...accepted],
  ignored:parsed.ignored.filter(x=>!acceptedLines.has(x.line))},
  lookups:status,added_constraints:accepted.length,state:"looked_up"};
}
