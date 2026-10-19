/** P1 research-only browser checks. Do not confuse with full JSON Schema certification. */
const methods = new Set(["approved_url_adapter","pasted_text","ai_json","manual"]);
const travels = new Set(["walk_only","bus_plus_walk","unknown"]);
const quals = new Set(["exact_advertised","approximate","unknown"]);
const kinds = new Set(["explicit","inferred","unknown"]);
const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const named = v => typeof v === "string" && v.trim().length > 0;
const walk = v => v === null || (Number.isInteger(v) && v >= 1 && v <= 180);

export function evidenceValue(doc, path) {
  if (typeof path !== "string" || !/^listing(?:\.[A-Za-z_][A-Za-z_0-9]*|\[\d+\])+$/.test(path)) {
    return {found:false,value:null};
  }
  let cur=doc;
  for(const part of (path.match(/[A-Za-z_][A-Za-z_0-9]*|\[\d+\]/g)||[])){
    const key=part.startsWith("[") ? Number(part.slice(1,-1)) : part;
    if(cur===null || typeof cur!=="object" || !Object.prototype.hasOwnProperty.call(cur,key)) return {found:false,value:null};
    cur=cur[key];
  }
  return {found:true,value:cur};
}

export function reviewInput(raw, originalText=""){
  const errors=[], warnings=[];
  if(typeof raw!=="string" || raw.length>200000 || typeof originalText!=="string" || originalText.length>200000){
    return {valid:false,errors:["入力の形式かサイズ（上限20万文字）が不正です。"],warnings,data:null};
  }
  let doc;
  try{doc=JSON.parse(raw);}catch(_){return {valid:false,errors:["JSONの構文が正しくありません。"],warnings,data:null};}
  if(!obj(doc) || doc.schema_version!=="0.2") errors.push("schema_version は0.2を指定してください。");
  if(!Array.isArray(doc?.sources) || !doc.sources.length) errors.push("sources（出典）が必要です。");
  if(!obj(doc?.listing)) errors.push("listing（物件条件）が必要です。");
  if(!Array.isArray(doc?.evidence) || !doc.evidence.length) errors.push("evidence（根拠）が必要です。");
  if(errors.length) return {valid:false,errors,warnings,data:doc};

  const ids=new Set();
  if(doc.sources.length>100) errors.push("出典の上限は100件です。");
  doc.sources.slice(0,100).forEach((source,i)=>{
    if(!obj(source) || !named(source.id) || !methods.has(source.method)){
      errors.push("sources["+i+"]のIDまたは取得方法が不正です。");return;
    }
    if(ids.has(source.id)) errors.push("出典IDが重複しています: "+source.id);
    ids.add(source.id);
    if(source.method==="approved_url_adapter" && source.terms_checked!==true) warnings.push("URL取得の利用条件を確認してください。");
  });
  const st=doc.listing.stations,p=doc.listing.nearby;
  if(!Array.isArray(st) || !Array.isArray(p)) errors.push("stationsとnearbyは配列にしてください。");
  else{
    if(st.length>100 || p.length>100) errors.push("駅・施設の上限は各100件です。");
    st.slice(0,100).forEach((x,i)=>{
      if(!obj(x) || !named(x.name) || !travels.has(x.travel_mode) || !quals.has(x.qualifier) || !walk(x.walk_minutes))
        errors.push("stations["+i+"]の駅名・徒歩分数・移動方法が不正です。");
      else if(x.travel_mode!=="walk_only" && x.walk_minutes!==null)
        warnings.push("stations["+i+"]は純粋な徒歩距離として判定できません。");
    });
    p.slice(0,100).forEach((x,i)=>{
      if(!obj(x) || !named(x.name) || !["named_place","generic_category"].includes(x.kind) || !quals.has(x.qualifier) || !walk(x.walk_minutes))
        errors.push("nearby["+i+"]の施設情報が不正です。");
      if(x?.kind==="generic_category") warnings.push("nearby["+i+"]は一般カテゴリのため施設を一意に指定できません。");
    });
  }
  if(doc.listing.built_year!=null && (!Number.isInteger(doc.listing.built_year) || doc.listing.built_year<1850 || doc.listing.built_year>2100))
    errors.push("築年が不正です。");
  if(doc.listing.building_floors!=null && (!Number.isInteger(doc.listing.building_floors) || doc.listing.building_floors<1))
    errors.push("建物階数が不正です。");
  if(doc.evidence.length>300) errors.push("根拠の上限は300件です。");
  doc.evidence.slice(0,300).forEach((e,i)=>{
    if(!obj(e) || !named(e.source_id) || !ids.has(e.source_id)){errors.push("evidence["+i+"]の出典IDが存在しません。");return;}
    const ref=evidenceValue(doc,e.field_path);
    if(!ref.found || ref.value===null || ref.value===undefined) errors.push("evidence["+i+"]の参照先が存在しません。");
    if(!kinds.has(e.kind)) errors.push("evidence["+i+"]の根拠分類が不正です。");
    if(e.kind==="explicit"){
      if(!named(e.verbatim_excerpt)) errors.push("evidence["+i+"]の原文引用がありません。");
      else if(originalText.trim() && !originalText.includes(e.verbatim_excerpt)) errors.push("evidence["+i+"]の引用が入力原文に存在しません。");
      else if(!originalText.trim()) warnings.push("evidence["+i+"]は原文一致を未確認です。");
    }
    if(e.kind==="inferred") warnings.push("evidence["+i+"]は推定であり確定根拠ではありません。");
  });
  if(!originalText.trim()) warnings.push("広告原文が未入力のため内容の真偽は未確認です。");
  return {valid:errors.length===0,errors,warnings,data:doc};
}
