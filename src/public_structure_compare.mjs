/** Research diagnostic: combine already-published UR complex structure and
 * walking conditions without inventing confidence, independent corroboration,
 * or a structural match for a particular room/building inside a complex.
 */
import {comparePublicCandidates} from "./public_building_rank.mjs";

const allowed = new Set(["RC","SRC","S","WOOD","STEEL","OTHER"]);
const nonblank=x=>typeof x==="string"&&x.trim().length>0;

export function validateStructureEvidence(evidence){
 if(evidence?.schema_version!=="public-structure-v0.1" ||
    !Array.isArray(evidence.candidates)||!Array.isArray(evidence.ads)||
    !evidence.candidates.length||!evidence.ads.length||
    evidence.provenance_policy?.includes("IN-SAMPLE")!==true)
   throw Error("Structure evidence must declare source correlation");
 for(const list of [evidence.candidates,evidence.ads]){
  const ids = new Set();
  for(const rec of list){
    const id=rec.candidate_id??rec.advertisement_id;
    if(!nonblank(id)||ids.has(id)||!allowed.has(rec.structure)||
      !nonblank(rec.source_url)||!rec.source_url.startsWith("https://www.ur-net.go.jp/"))
      throw Error("Invalid structure record");
    ids.add(id);
  }
 }
 if(evidence.candidates.some(c=>!nonblank(c.verbatim)||c.scope!=="managed_complex"))
  throw Error("Structure sources must be explicit, and at complex level");
 if(evidence.ads.some(a=>a.source_relation!=="same_UR_primary_as_candidate"))
  throw Error("This diagnostic only supports declared source-correlated advertisements");
}

/** "Candidate agrees with advertised structure" is an alternative evidence
 * partition, not independent validation and not a final elimination gate.
 * The underlying nominal route-gap score is retained for transparency.
 */
export function comparePublicStructure(doc,evidence,advertisementId,{useStructure=true,places=null}={}){
 validateStructureEvidence(evidence);
 const base=comparePublicCandidates(doc,advertisementId,places);
 const advertised=evidence.ads.find(a=>a.advertisement_id===advertisementId);
 const records=new Map(evidence.candidates.map(c=>[c.candidate_id,c]));
 if(!advertised)throw Error("No official advertised structure found");
 const rows=base.ranked.map(r=>{
  const found=records.get(r.candidate_id);
  const status=!found?"unknown":found.structure===advertised.structure?"same":"different";
  return {...r,advertised_structure:advertised.structure,
    candidate_structure:found?.structure??null,
    structure_status:status,
    structure_scope:found?.scope??null,
    structure_source_url:found?.source_url??null,
    independent_structure_evidence:false,
    official_UR_same_provider:true};
 });
 if(useStructure){
  // Public complex structure agreement is shown before walking-gap rank, but
  // mismatched or missing candidates remain visible. No hard exclusions.
  const order={same:0,unknown:1,different:2};
  rows.sort((a,b)=>order[a.structure_status]-order[b.structure_status] ||
    (a.total_absolute_gap_m??Infinity)-(b.total_absolute_gap_m??Infinity) ||
    a.candidate_id.localeCompare(b.candidate_id));
 }
 return {
  advertisement_id:advertisementId,
  mode:useStructure?"structure_then_walk_reference":"walk_reference_only",
  rank0:rows[0]?.candidate_id??null,
  ranked:rows,
  candidate_count:rows.length,
  independent_validation:false,
  source_correlation:"UR_advertisement_and_candidate_metadata_from_same_primary_provider",
  scope_limit:"complex_overview_not_each_building",
  building_verified:false,
  can_eliminate_candidate:false,
  estimated_true_accuracy:null,
  interpretive_warning:"in_sample_structure_check_not_independent_or_generalizable"
 };
}
