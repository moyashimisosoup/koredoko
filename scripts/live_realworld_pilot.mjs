/**
 * APP-023: ONE real-world pilot, not an additional abstract test suite.
 * - Three previously directly read public property ads.
 * - Live OpenPOI network responses for their named PUBLIC landmarks.
 * - Actual area inference and mobile-sized Chromium UI.
 * - This report is descriptive, not a correct-property or accuracy claim.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {chromium} from "playwright";
import {makeAreaLandmarks,parseAreaInput,solveSearchArea} from "../src/area_overlap_solver.mjs";
import {buildOpenPoiSearchUrl,vetOpenPoiSearchResponse} from "../src/openpoi_facility_matcher.mjs";
const file=n=>JSON.parse(readFileSync(new URL("../examples/"+n,import.meta.url),"utf8"));
const ids=["H01","H02","H03"];
const ads=file("hibari_real_ads_prelocked_20261021.json").advertisements;
const pois=file("hibari_poi_identities_20261021.json");
const refs=file("hibari_geolonia_v2_address_number_20261022.json");
const towns=file("hibari_geolonia_town_chome_references_20261022.json");
const registry=makeAreaLandmarks(pois,refs,towns);
// G1 retest changes advertisement clue selection only. The previous live
// OpenPOI 3-query outcome is already recorded, so do not repeat costly
// network discovery without an explicit APP023_RECHECK_OPENPOI=1.
const checkOpenPoi=process.env.APP023_RECHECK_OPENPOI==="1";
const output={date:"2026-10-22",mode:"G1_one_time_real_ad_recheck",advertisement_cases:[],openpoi_live:[],
  openpoi_rechecked_this_run:checkOpenPoi,
  openpoi_previous_observation:{run_id:39773177928,http200:3,accepted:0},
  browser:{},review:{},disclaimers:["No true location or address used as input","No scoring of individual dwellings",
  "200m grid exploratory overlap, not pedestrian isochrone","OpenPOI prior outcome is not re-measured unless specifically enabled"]};
mkdirSync("realworld-pilot-artifacts",{recursive:true});
for(const id of ids){
 const ad=ads.find(x=>x.ad_id===id);
 if(ad?.listing?.source_tier!=="direct_page_read")throw Error("not direct source "+id);
 // Verbatim published facility text, not inferred address or target building.
 const content=ad.facilities.map(x=>x.source_excerpt).join("\n");
 const parsed=parseAreaInput(content,registry,towns.records);
 const result=solveSearchArea(parsed);
 const row={ad_id:id,source_tier:ad.listing.source_tier,excerpts:ad.facilities.length,
  parsed_clues:parsed.constraints.length,
  withheld_contradictory:parsed.ignored.filter(x=>x.reason.includes("不整合")).length,
  weak_distance_mode_unknown:parsed.constraints.filter(x=>x.metric==="distance_mode_unknown").length,
  ignored:parsed.ignored,partial_address_used:false,
  state:result.state,estimated_areas:result.region_count,area_km2:result.region_area_km2,
  contradictions_admitted_to_solver:result.contradictory_clues??0,
  mode:"coarse_straight_distance_area_not_road_network"};
 output.advertisement_cases.push(row);
 if(result.state!=="exploratory_areas"||result.clues_used<2||!Number.isFinite(result.region_area_km2))
  output.review.user_flow_blocked=true;
}
const first=registry.find(x=>x.name==="ひばりが丘郵便局")??registry.find(x=>x.name.includes("PARCO"));
if(!first?.location)throw Error("No public regional reference center available");
const center=first.location;
if(checkOpenPoi)for(const query of ["ひばりが丘郵便局","ひばりが丘PARCO","西友ひばりヶ丘店"]){
 let row={public_poi_name:query,endpoint:"GET /v1/search",request_disclosed_fields:["poi_name","public_reference_center"]};
 try{
  const url=buildOpenPoiSearchUrl(query,center);
  const res=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(14000)});
  row.http_status=res.status;
  if(!res.ok){row.state="HTTP_FAILURE";output.openpoi_live.push(row);continue;}
  const body=await res.json();
  row.returned_count=body.count??body.results?.length??null;
  const vetted=vetOpenPoiSearchResponse(body,query,center);
  row.state=vetted.status;
  row.name_exact_regional_matched=vetted.match!==null;
  row.ambiguous_or_missing=vetted.match===null;
  row.match_source=vetted.match?.source??null;
  row.match_precision=vetted.match?.precision??null;
  row.match_category=vetted.match?.category??null;
  row.match_attributions=vetted.match?.attributions??[];
  row.match_licenses=vetted.match?.licenses??[];
  // Only public facility coordinate, never a private user's inferred position.
  row.public_facility_location=vetted.match?.location??null;
 }catch(e){row.state="REQUEST_ERROR";row.reason=String(e.message).slice(0,180);}
 output.openpoi_live.push(row);
}
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const response=await page.goto("http://127.0.0.1:8765/area.html",{waitUntil:"domcontentloaded",timeout:30000});
 output.browser.page_http_status=response.status();
 for(const id of ids){
  const lines=ads.find(x=>x.ad_id===id).facilities.map(x=>x.source_excerpt).join("\n");
  await page.locator("#advertisement").fill(lines);
  await page.locator("#search").click();
  await page.locator("#result").waitFor({state:"visible",timeout:15000});
  const text=await page.locator("#summary").innerText();
  const cells=await page.locator("#map rect").count();
  output.browser[id]={summary:text,displayed_area_grid_cells:cells,visible:cells>=9};
  if(cells<9)output.review.user_flow_blocked=true;
  await page.screenshot({path:"realworld-pilot-artifacts/"+id+"-mobile-chromium.png",fullPage:true});
 }
 output.browser.viewport_width=390;
 output.browser.js_errors=errors;
 output.browser.horizontal_overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+3);
 if(errors.length||output.browser.horizontal_overflow)output.review.user_flow_blocked=true;
 await context.close();
}finally{await browser.close();}
output.review.live_openpoi_http_200=checkOpenPoi?output.openpoi_live.filter(x=>x.http_status===200).length:null;
output.review.live_openpoi_name_matches=checkOpenPoi?output.openpoi_live.filter(x=>x.name_exact_regional_matched).length:null;
output.review.G1_H02_conflicting_claim_withheld=output.advertisement_cases.find(x=>x.ad_id==="H02")?.withheld_contradictory===1;
output.review.G1_H03_unqualified_park_weak=output.advertisement_cases.find(x=>x.ad_id==="H03")?.weak_distance_mode_unknown===1;
if(!output.review.G1_H02_conflicting_claim_withheld||!output.review.G1_H03_unqualified_park_weak)
 output.review.user_flow_blocked=true;
output.review.all_three_ads_produced_area=output.advertisement_cases.every(x=>x.state==="exploratory_areas"&&x.parsed_clues>=2);
output.review.real_world_accuracy_measured=false;
output.review.known_building_target_used=false;
output.review.published_iPhone_Safari_hardware_checked=false;
output.review.production_gate=output.review.user_flow_blocked?"BLOCKED":"PILOT_RENDERED_ONLY_NEEDS_USABILITY_AND_GROUND_TRUTH_REVIEW";
writeFileSync("realworld-pilot-artifacts/public_pilot_summary.json",JSON.stringify(output,null,2));
console.log("APP023_LIVE_PILOT_SUMMARY="+JSON.stringify(output));
if(output.review.user_flow_blocked)process.exitCode=1;
