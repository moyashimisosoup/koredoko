#!/usr/bin/env node
/** APP-023 manual-only GSI public address-reference probe.
 * Run from repository root:
 *   node scripts/hibari_geocode_probe.mjs                   (NO network)
 *   node scripts/hibari_geocode_probe.mjs --live --limit=2 (max 2 slow GET)
 *   node scripts/hibari_geocode_probe.mjs --live --offset=2 --limit=2 (next 2 GET)
 * Prints a record for review, never marks public housing entrances as verified.
 * This script DOES NOT call Valhalla, score ads, or publish coordinates to GitHub.
 */
import {readFileSync} from "node:fs";
import {buildHibariGeocodeManifest,interpretGsiAddressFeatures} from "../src/hibari_reference_point_plan.mjs";
const load=s=>JSON.parse(readFileSync(new URL("../examples/"+s,import.meta.url),"utf8"));
const opts=new Set(process.argv.slice(2));
const offsetArg=[...opts].find(x=>x.startsWith("--offset="));
const offset=offsetArg?Number(offsetArg.split("=")[1]):0;
if(!Number.isInteger(offset)||offset<0||offset>17)throw Error("--offset must be 0 to 17");
const limitArg=[...opts].find(x=>x.startsWith("--limit="));
const limit=limitArg?Number(limitArg.split("=")[1]):2;
if(!Number.isInteger(limit)||limit<1||limit>18)throw Error("--limit must be 1 to 18");
const manifest=buildHibariGeocodeManifest(
 load("hibari_public_building_addresses_20261021.json"),
 load("hibari_poi_identities_20261021.json"),{directOnly:!opts.has("--all")});
const live=opts.has("--live"),selected=manifest.requests.slice(offset,offset+limit);
const result={schema_version:"app023-gsi-probe-v0.1",cohort_id:manifest.cohort_id,
 mode:live?"live_manual_research":"offline_manifest_only",created_at:new Date().toISOString(),
 planned_requests:manifest.requests.length,offset,requested_limit:limit,attempted:0,records:[],
 privacy:"named public facilities and apartment buildings only; no private units; address points are not doors"};
for(let i=0;i<selected.length;i++){
 const q=selected[i];
 if(!live){result.records.push({key:q.key,status:"not_requested",address:q.query_address,gsi_url:q.gsi_url});continue;}
 let out;
 try{
  // Bounded, unauthenticated public GET. No retries or parallel burst.
  const response=await fetch(q.gsi_url,{signal:AbortSignal.timeout(10000),
   headers:{"Accept":"application/json","User-Agent":"koredoko-research-public-address-preflight/0.1"}});
  result.attempted++;
  if(!response.ok){
   out={key:q.key,status:"http_"+response.status,candidates:[],geocoded:false};
   result.records.push(out);
   if(response.status===429||response.status===403)break;
  } else {
   const payload=await response.json();
   out=interpretGsiAddressFeatures(q,payload);
   result.records.push({...out,gsi_url:q.gsi_url,retrieved_at:new Date().toISOString()});
  }
 }catch(e){
  result.attempted++;result.records.push({key:q.key,status:"request_failed",
   message:String(e).slice(0,180),candidates:[],geocoded:false});
 }
 if(i<selected.length-1)await new Promise(resolve=>setTimeout(resolve,1600));
}
result.observed_pedestrian_routes=0;
result.verified_building_or_facility_entrances=0;
result.scoring_ready=false;
process.stdout.write(JSON.stringify(result,null,2)+"\n");
