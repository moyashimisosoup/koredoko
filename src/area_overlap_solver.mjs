/**
 * APP-023: infer a BROAD public-advertisement search AREA, not a property.
 *
 * No building registry, listing name, private address, occupant, or precise
 * inferred point enters this solver. Region cells are 200m and deliberately
 * expanded by 1 cell before display. The center is internal grid geometry.
 *
 * Inputs: public landmark coordinate references and advertised distance clues.
 * Road-route API / isodistance shapes can replace the provisional straight-line
 * distance model later. No confidence/probability claim is made here.
 */
const EARTH=6371000, RAD=Math.PI/180;
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const required=(x,m)=>{if(!x)throw Error(m);};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=s=>String(s??"").normalize("NFKC").replace(/[\s\u3000]/g,"").toLowerCase();
const chinese={"一":"1","二":"2","三":"3","四":"4","五":"5","六":"6","七":"7","八":"8","九":"9"};
function townKey(s){return norm(s).replace(/[一二三四五六七八九]丁目/g,x=>chinese[x[0]]+"丁目");}
const stationAliases=["ひばりヶ丘駅","ひばりが丘駅","西武ひばりヶ丘駅"];
export function makeAreaLandmarks(pois,refs,towns){
 required(pois?.schema_version==="app023-poi-identity-ledger-v0.1","POI registry missing");
 required(refs?.cohort_id==="hibarigaoka-20261021"&&towns?.cohort_id===refs.cohort_id,"Reference cohort mismatch");
 const byRef=new Map(refs.references.map(r=>[r.target_id,r]));
 const byTown=new Map(towns.records.map(r=>[townKey(r.town),r]));
 const out=[];
 const get=(id,name,aliases)=>{
  const r=byRef.get(id);
  if(!r)throw Error("Unknown public landmark reference");
  const exact=r.status==="address_number_unique"?r.point:null;
  const low=exact?null:byTown.get(townKey(r.normalized_town));
  if(!exact&&!low)return {id,name,aliases,location:null,precision:"unlocated"};
  return {id,name,aliases,location:exact?{lat:exact.latitude,lon:exact.longitude}:{lat:low.lat,lon:low.lon},
   precision:exact?"address_number_reference":"town_chome_reference",
   is_entrance:false};
 };
 const station=byRef.get("station:seibu-hibarigaoka");
 if(station)out.push(get("station:seibu-hibarigaoka","ひばりヶ丘駅",stationAliases));
 for(const poi of pois.facilities){
  out.push(get("facility:"+poi.physical_id,poi.official_name,poi.aliases));
 }
 return out;
}
/**
 * Interpret ONLY public landmark names and explicit metric/walking claims.
 * Unsupported names, origin locations, and ambiguous multi-POI lines are
 * noted, never filled with guessed data. Partial street/town is a soft bias.
 */
export function parseAreaInput(text,landmarks,towns=[]){
 required(typeof text==="string"&&text.length<=25000,"Invalid advertisement text");
 required(Array.isArray(landmarks)&&landmarks.length>0,"Landmark list missing");
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 required(lines.length<=80,"Too many advertisement lines");
 const constraints=[],ignored=[];
 const byId=new Map(landmarks.map(x=>[x.id,x]));
 for(const [i,line] of lines.entries()){
  const n=norm(line);
  const matches=landmarks.filter(x=>x.aliases.some(a=>n.includes(norm(a))));
  if(matches.length>1){ignored.push({line:i+1,reason:"複数施設の距離を同じ行から判定できません"});continue;}
  if(matches.length===0){if(/(?:徒歩\d+分|約?\d+m|メートル)/.test(n))ignored.push({line:i+1,reason:"施設名が未登録です"});continue;}
  const m=matches[0],meters=n.match(/(?:約|およそ)?(\d{1,5})(?:m|メートル)(?![a-z])/i);
  const walk=n.match(/徒歩(\d{1,3})分/);
  const d=meters?Number(meters[1]):null,minute=walk?Number(walk[1]):null;
  if((d===null&&minute===null)||(d!==null&&(d<1||d>10000))||
      (minute!==null&&(minute<1||minute>120))){
   ignored.push({line:i+1,reason:"有効な距離・徒歩分数が読み取れません"});continue;
  }
  if(!m.location){
   ignored.push({line:i+1,reason:"施設の参照座標がありません"});continue;
  }
  // Do not reject contradictory ad fields. Mark as inconsistency instead.
  const contradictory=d!==null&&minute!==null&&Math.ceil(d/80)!==minute;
  const prev=constraints.find(c=>c.landmark_id===m.id);
  if(prev){ignored.push({line:i+1,reason:"同じ施設の重複する条件は要確認"});continue;}
  constraints.push({landmark_id:m.id,label:m.name,location:m.location,precision:m.precision,
    stated_meters:d,stated_minutes:minute,metric:d!==null?"distance":"walking_minutes",
    quote:line,source_line:i+1,conflicting_advertisement_numbers:contradictory});
 }
 // A partial address such as 谷戸町二丁目 is a soft prior. Town centroids
 // are NOT administrative boundaries and must NOT hard-clip the output.
 let partialAddress=null;
 const allText=townKey(text);
 for(const r of towns){
  if(allText.includes(townKey(r.town))){
   partialAddress={name:r.town,location:{lat:r.lat,lon:r.lon},precision:"town_chome_representative",
    use:"soft_context_not_a_geographic_boundary"};break;
  }
 }
 return {constraints,ignored,partialAddress,has_usable_clues:constraints.length>0};
}
function xy(lat,lon,refLat,refLon){
 const fy=RAD*EARTH,fx=fy*Math.cos(refLat*RAD);
 return {x:(lon-refLon)*fx,y:(lat-refLat)*fy};
}
function ll(x,y,refLat,refLon){
 const fy=RAD*EARTH,fx=fy*Math.cos(refLat*RAD);
 return [Math.round((refLon+x/fx)*1e5)/1e5,Math.round((refLat+y/fy)*1e5)/1e5];
}
function roadBand(c){
 if(c.stated_meters!==null){
  // Unknown advertisement meters can mean straight or walking route;
  // use loose discrepancy scale rather than a hard equality ring.
  const d=c.stated_meters;
  return {lo:Math.max(0,d-60),hi:d+60,sigma:c.precision==="town_chome_reference"?420:180};
 }
 const n=c.stated_minutes;
 // Official advertised minutes are CEIL(road distance/80m);
 // a straight line is <= road distance. The route multiplier is unknown.
 return {lo:(n-1)*80,hi:n*80,sigma:c.precision==="town_chome_reference"?450:200};
}
function softFit(d,c){
 const r=roadBand(c),modeled=d*1.3;
 const err=modeled<r.lo?r.lo-modeled:modeled>r.hi?modeled-r.hi:0;
 const dataQuality=c.precision==="town_chome_reference"?0.25:1;
 return {penalty:dataQuality*Math.min((err/r.sigma)**2,16),
   // A direct-distance lower bound is insufficient to reject areas.
   clearly_too_far:d>r.hi+(c.precision==="town_chome_reference"?500:160)};
}
/** Coarse numerical search. Every selected coarse 200m cell is expanded by one
 * neighboring cell, so the renderer never outputs a pinpoint location.
 * This is a prioritized search footprint, not a mathematically complete
 * feasible set or a legal property-boundary polygon.
 */
export function solveSearchArea(parsed,{stepM=200}={}){
 required(parsed&&Array.isArray(parsed.constraints),"Parsed evidence required");
 required(stepM===200,"Fixed privacy-preserving search grid required");
 const clues=parsed.constraints.filter(x=>x.location&&finite(x.location.lat)&&finite(x.location.lon));
 if(clues.length===0)return {state:"insufficient_landmarks",grid:[],regions:[],clues_used:0,
  region_area_km2:null,center_point:null,accuracy:null,notice:"施設の距離条件がないため探索区域は算出できません。"};
 required(clues.length<=20,"Too many landmarks");
 const refLat=clues.reduce((s,x)=>s+x.location.lat,0)/clues.length;
 const refLon=clues.reduce((s,x)=>s+x.location.lon,0)/clues.length;
 const coords=clues.map(x=>xy(x.location.lat,x.location.lon,refLat,refLon));
 const maxR=clamp(Math.max(...clues.map(c=>roadBand(c).hi))+450,900,2600);
 const extra=Math.max(...coords.map(c=>Math.max(Math.abs(c.x),Math.abs(c.y))));
 const radius=clamp(maxR+extra,1300,3400);
 const extent=Math.ceil(radius/stepM);
 const scope=parsed.partialAddress?.location?xy(parsed.partialAddress.location.lat,
  parsed.partialAddress.location.lon,refLat,refLon):null;
 const total=(extent*2+1)**2;
 required(total<=1300,"Area too broad for demo");
 const grid=[];
 for(let iy=-extent;iy<=extent;iy++)for(let ix=-extent;ix<=extent;ix++){
  const x=ix*stepM,y=iy*stepM;
  let loss=0,weight=0,far=0;
  for(let i=0;i<clues.length;i++){
   const d=Math.hypot(x-coords[i].x,y-coords[i].y);
   const fit=softFit(d,clues[i]);
   const q=clues[i].precision==="town_chome_reference"?0.25:1;
   loss+=fit.penalty;weight+=q;if(fit.clearly_too_far)far++;
  }
  if(scope){
   // Broad, non-exclusive hint only: centroid is not legal town boundary.
   const r=Math.hypot(x-scope.x,y-scope.y);
   loss+=0.2*Math.min((Math.max(0,r-850)/1000)**2,4);
   weight+=0.2;
  }
  grid.push({ix,iy,x,y,penalty:loss/Math.max(weight,0.01),distant_clues:far});
 }
 grid.sort((a,b)=>a.penalty-b.penalty||a.ix-b.ix||a.iy-b.iy);
 const best=grid[0].penalty;
 const topCount=Math.max(10,Math.ceil(total*0.10));
 // Do not make a razor-thin best-fit point appear as a verified location.
 const selected=grid.slice(0,topCount).filter((a,i)=>i<10||a.penalty<=best+0.65);
 const selectedKeys=new Set(selected.map(c=>c.ix+","+c.iy));
 const expanded=new Set();
 for(const c of selected)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
  expanded.add((c.ix+dx)+","+(c.iy+dy));
 // Assign contiguous grid cells to distinct regions instead of selecting one center.
 const pending=new Set(expanded),parts=[];
 while(pending.size){
  const first=pending.values().next().value,queue=[first],cells=[];
  pending.delete(first);
  for(let i=0;i<queue.length;i++){
   const key=queue[i],coords=key.split(",").map(Number),[a,b]=coords;
   cells.push({ix:a,iy:b});
   for(const next of [[a+1,b],[a-1,b],[a,b+1],[a,b-1]]){
    const k=next.join(",");
    if(pending.delete(k))queue.push(k);
   }
  }
  parts.push(cells);
 }
 parts.sort((a,b)=>b.length-a.length);
 // Return actual coarse selected squares, NOT bounding rectangles that fill
 // holes between disjoint bands. GeoJSON represents AREAS only, no Point.
 const features=[];
 for(let z=0;z<parts.length;z++){
  const cells=parts[z];
  const polygons=cells.map(p=>{
   const x=p.ix*stepM,y=p.iy*stepM,h=stepM/2;
   return [[ll(x-h,y-h,refLat,refLon),ll(x+h,y-h,refLat,refLon),
     ll(x+h,y+h,refLat,refLon),ll(x-h,y+h,refLat,refLon),
     ll(x-h,y-h,refLat,refLon)]];
  });
  features.push({type:"Feature",properties:{area_index:z+1,
    area_km2:Math.round(cells.length*stepM*stepM/10000)/100,
    interpretation:"coarse_search_footprint_not_a_specific_property"},
    geometry:{type:"MultiPolygon",coordinates:polygons}});
 }
 const tiles=[...expanded].map(k=>{
  const [ix,iy]=k.split(",").map(Number);
  return {ix,iy};
 });
 return {state:"exploratory_areas",grid:tiles,regions:{type:"FeatureCollection",features},
  ref_lat:refLat,ref_lon:refLon,grid_step_m:stepM,grid_extent_m:radius,
  region_area_km2:Math.round(tiles.length*stepM*stepM/10000)/100,
  region_count:parts.length,clues_used:clues.length,
  unresolved:parsed.ignored?.length??0,
  center_point:null,property_candidates:null,accuracy:null,probability:null,
  contradictory_clues:clues.filter(x=>x.conflicting_advertisement_numbers).length,
  notice:"推定区域は200m格子を広げた探索の目安です。徒歩の実経路や物件所在地を示すものではありません。"};
}
