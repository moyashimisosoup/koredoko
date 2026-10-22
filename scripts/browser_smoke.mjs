/**
 * APP-023 actual Chromium interaction smoke on a locally served PR branch.
 * NOT an iPhone Safari hardware test, hosted deployment, or accuracy test.
 */
import {strict as assert} from "node:assert";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
const origin="http://127.0.0.1:8765";
const out="browser-smoke-artifacts";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={mode:"local-pr-browser-smoke",engine:"Playwright Chromium",checks:[],
 not_checked:["iPhone real Safari hardware","published website deployment","location prediction accuracy"]};
async function pageFor(label,options){
 const context=await browser.newContext(options);
 const page=await context.newPage();
 const pageErrors=[],outside=[];
 page.on("pageerror",error=>pageErrors.push(error.message));
 await page.route("**/*",route=>{
  if(!route.request().url().startsWith(origin+"/")){
   outside.push(route.request().url());return route.abort();
  }
  return route.continue();
 });
 const res=await page.goto(origin+"/hibari-same-region.html",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(res.status(),200,label+" HTTP status");
 await page.waitForFunction(()=>document.querySelector("#candidates")?.querySelectorAll(".card").length===7,null,{timeout:30000});
 assert.equal(await page.locator("#plot .pin").count(),18,label+" geolocated reference points");
 assert.equal(await page.locator("#candidates .card").count(),7);
 assert.equal(await page.locator("#placeList button").count(),11);
 assert.match(await page.locator("#conditionStatus").innerText(),/根拠がある施設条件 2件/);
 report.checks.push(label+": H01 loads seven candidates, 18 location refs, 11 POI/station alternatives");
 await page.locator("#ad").selectOption("H02");
 await page.waitForFunction(()=>document.querySelector("#conditions")?.textContent?.includes("PARCO"),null,{timeout:10000});
 assert.equal(await page.locator("#conditions .entry").count(),2);
 await page.locator("#factor").selectOption("1.6");
 await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("直線×1.6"),null,{timeout:10000});
 assert.equal(await page.locator("#candidates .card").count(),7);
 report.checks.push(label+": H02 two real quoted clues, factor changed, seven candidates remain");
 await page.locator("#placeList button").first().click();
 assert.ok((await page.locator("#detail").innerText()).length>20);
 await page.locator("#candidates .card button").first().click();
 assert.match(await page.locator("#detail").innerText(),/探索順|条件/);
 report.checks.push(label+": selects POI fallback and public candidate to view evidence");
 await page.screenshot({path:out+"/"+label+"-H02.png",fullPage:true});
 await page.locator("#mode").selectOption("text");
 await page.locator("#adText").fill("ひばりが丘PARCO：徒歩3分\n未知の商店 徒歩9分");
 await page.locator("#run").click();
 await page.waitForFunction(()=>document.querySelector("#conditionStatus")?.textContent?.includes("条件 1件"),null,{timeout:10000});
 assert.equal(await page.locator("#conditions .entry").count(),1);
 assert.equal(await page.locator("#candidates .card").count(),7);
 assert.match(await page.locator("#withheld").innerText(),/no_exact_public_place_name/);
 report.checks.push(label+": pasted non-JSON input accepts one named clue and withholds unknown place");
 await page.locator("#mode").selectOption("json");
 await page.locator("#json").fill("not json");
 await page.locator("#run").click();
 await page.waitForFunction(()=>document.querySelector("#conditionStatus")?.textContent?.includes("比較できません"),null,{timeout:10000});
 assert.equal(await page.locator("#candidates .card").count(),0,"invalid input must clear stale ranking");
 await page.locator("#mode").selectOption("prelocked");
 await page.locator("#ad").selectOption("H03");
 await page.locator("#run").click();
 await page.waitForFunction(()=>document.querySelector("#conditions")?.textContent?.includes("西友"),null,{timeout:10000});
 assert.equal(await page.locator("#candidates .card").count(),7);
 const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
 assert.ok(overflow.scroll<=overflow.viewport+3,label+" horizontal overflow: "+JSON.stringify(overflow));
 assert.equal(outside.length,0,label+" external network requests");
 assert.deepEqual(pageErrors,[],label+" page exceptions");
 report.checks.push(label+": bad JSON clears ranking and can recover to H03; no overflow, JS errors or external HTTP");
 await page.screenshot({path:out+"/"+label+"-final.png",fullPage:true});
 await context.close();
}
try{
 await pageFor("desktop",{viewport:{width:1280,height:800}});
 await pageFor("mobile-chromium",{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(JSON.stringify({...report,failures:[e.stack||String(e)]},null,2));process.exitCode=1;
}finally{await browser.close();}
