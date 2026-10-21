/**
 * APP-023: offline MLIT ISJ block-level reference matcher.
 * Consumes an already obtained MLIT "街区レベル位置参照情報" CSV, decoded
 * from Shift-JIS. Never guesses entrances, does not call network APIs.
 * Spec: https://nlftp.mlit.go.jp/isj/data.html
 */
const VALID_CITY="西東京市";
const DIGITS={"〇":0,"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9};
const kanjiNumber=x=>{
 if(/^\d+$/.test(x))return Number(x);
 if(!/^[〇零一二三四五六七八九十]+$/.test(x))return NaN;
 if(!x.includes("十"))return [...x].reduce((v,c)=>v*10+DIGITS[c],0);
 const [left,right]=x.split("十");
 if(x.split("十").length!==2)return NaN;
 return (left?[...left].reduce((v,c)=>v*10+DIGITS[c],0):1)*10+
  (right?[...right].reduce((v,c)=>v*10+DIGITS[c],0):0);
};
export function normalizeJapaneseBlockString(input){
 if(typeof input!=="string")return "";
 const s=input.normalize("NFKC").replace(/\s/g,"").replace(/[－−―ｰ‐]/g,"-");
 return s.replace(/[〇零一二三四五六七八九十]+(?=丁目|番(?:地)?|号|$)/g,m=>{
  const n=kanjiNumber(m);return Number.isFinite(n)?String(n):m;
 });
}
/** Null when a specific town+chome+block cannot be read. */
export function parseNishitokyoBlock(input){
 const s=normalizeJapaneseBlockString(input);
 const start=s.indexOf(VALID_CITY);
 if(start<0)return null;
 const rest=s.slice(start+VALID_CITY.length);
 const m=rest.match(/^([^0-9]+?)(\d+)丁目(?:[-－])?(\d+)(?:番地?|[-－])/);
 if(!m)return null;
 return {city:VALID_CITY,town:m[1],chome:Number(m[2]),block:Number(m[3])};
}
/** RFC 4180-ish: handles quoted commas, escaped quotes, CRLF. Reject incomplete quoting. */
export function parseCsvRecords(csv){
 if(typeof csv!=="string"||csv.length>250_000_000)throw Error("CSV missing or too large");
 const records=[];let row=[],cell="",quoted=false,atStart=true;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){
   if(c==='"'&&csv[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;
   else cell+=c;continue;
  }
  if(c==='"'){
   if(!atStart)throw Error("Invalid quote in CSV");
   quoted=true;atStart=false;
  } else if(c===","){row.push(cell);cell="";atStart=true;}
  else if(c==="\n"||c==="\r"){
   if(c==="\r"&&csv[i+1]==="\n")i++;
   row.push(cell); if(row.some(x=>x.length))records.push(row);
   row=[];cell="";atStart=true;
  } else {cell+=c;atStart=false;}
 }
 if(quoted)throw Error("Unclosed CSV quote");
 row.push(cell);if(row.some(x=>x.length))records.push(row);
 return records;
}
const EXPECT=["都道府県名","市区町村名","大字・町丁目名","小字・通称名","街区符号・地番"];
const str=x=>(typeof x==="string"?x.trim():"");
const numerical=x=>x!==""&&Number.isFinite(Number(x))?Number(x):NaN;
export function parseIsjBlocks(csv){
 const rows=parseCsvRecords(csv);
 if(rows.length<2)throw Error("ISJ block CSV has no data");
 const head=rows[0].map(x=>x.replace(/^\uFEFF/,"").trim());
 if(!EXPECT.every((k,i)=>head[i]===k))throw Error("Unsupported MLIT ISJ columns");
 const out=[];let discarded=0;
 for(const cells of rows.slice(1)){
  if(cells.length<12)throw Error("Truncated ISJ block row");
  const history=cells.slice(12);
  // Deleted historical records cannot count as current evidence.
  if(history.some(x=>str(x)==="3")){discarded++;continue;}
  const city=str(cells[1]),pref=str(cells[0]);if(pref!=="東京都"||city!==VALID_CITY)continue;
  const district=normalizeJapaneseBlockString(str(cells[2])+str(cells[3]));
  const no=normalizeJapaneseBlockString(str(cells[4]));
  const address=parseNishitokyoBlock(VALID_CITY+district+no+"番");
  const lat=numerical(str(cells[8])),lon=numerical(str(cells[9]));
  if(!address||!Number.isFinite(lat)||!Number.isFinite(lon)||
    lat<35||lat>36.5||lon<138||lon>141){discarded++;continue;}
  out.push({
   ...address,lat,lon,representative: str(cells[11])==="1",
   location_kind:"MLIT_ISJ_block_representative_not_entrance",
   dwelling_display_flag:str(cells[10]),
  });
 }
 return {records:out,discarded,source:"MLIT_ISJ_street_block",data_version:"provided_by_importer"};
}
export function matchPublicBlockAddresses(buildings,pois,isj,{datasetYear,fileName}={}){
 if(buildings?.schema_version!=="app023-public-building-address-sources-v0.1"||
    pois?.schema_version!=="app023-poi-identity-ledger-v0.1"||
    !Array.isArray(isj?.records)||!Number.isInteger(datasetYear)||datasetYear<2000||datasetYear>2100||
    typeof fileName!=="string"||!fileName.trim())
   throw Error("Missing public ledger or auditable ISJ provenance");
 const src=[
  ...buildings.buildings.map(x=>({key:"building:"+x.candidate_id,query_address:x.public_building_address})),
  {key:"station:"+buildings.station.place_id,query_address:buildings.station.address},
  ...pois.facilities.map(x=>({key:"facility:"+x.physical_id,query_address:x.public_address}))
 ];
 const index=new Map();
 for(const x of isj.records){
  const k=[x.city,x.town,x.chome,x.block].join("|");
  if(!index.has(k))index.set(k,[]);
  index.get(k).push(x);
 }
 const results=src.map(q=>{
  const p=parseNishitokyoBlock(q.query_address);
  if(!p)return {key:q.key,status:"address_block_unparseable",reference_points:[],can_route:false};
  const hits=index.get([p.city,p.town,p.chome,p.block].join("|"))||[];
  const chosen=hits.filter(x=>x.representative);
  const points=(chosen.length?chosen:hits).map(x=>({
   lat:x.lat,lon:x.lon,point_type:"MLIT_ISJ_block_representative",
   source_year:datasetYear,source_file:fileName,
   entrance_verified:false
  }));
  return {key:q.key,status:points.length===0?"block_not_found":points.length===1?"single_block_reference_review_needed":"multiple_block_references_review_needed",
   reference_points:points,can_route:false,entrance_verified:false,
   provenance:"街区レベル位置参照情報 国土交通省"};
 });
 return {schema_version:"app023-isj-reference-matches-v0.1",cohort_id:buildings.cohort_id,
  dataset_source:"https://nlftp.mlit.go.jp/isj/",source_year:datasetYear,source_file:fileName,
  input_source_is_offline:true,observed_pedestrian_routes:0,scoring_ready:false,
  public_sources:results.length,with_block_reference:results.filter(x=>x.reference_points.length>0).length,
  results};
}