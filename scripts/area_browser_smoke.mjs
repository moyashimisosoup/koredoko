/**
 * APP-023 area-first HTML acceptance. Run with a localhost static server
 * on 127.0.0.1:8765, Playwright Chromium & WebKit installed.
 * Mobile WebKit is NOT physical iPhone Safari certification.
 */
import {chromium,webkit} from "playwright";
import {strict as assert} from "node:assert";
import {mkdir} from "node:fs/promises";
const base="http://127.0.0.1:8765";
const checks=[];
await mkdir("area-smoke-artifacts",{recursive:true});
async function check(type,label,options){
 const browser=await type.launch({headless:true}),context=await browser.newContext(options);
 const page=await context.newPage(),errors=[],outside=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",route=>{
  const url=route.request().url();
  if(url.startsWith(base+"/"))return route.continue();
  // Real pinned Leaflet from CDN is part of the app. Do not download OSM
  // tiles in automated tests; OSM tile policy prohibits headless scraping.
  if(url.startsWith("https://unpkg.com/leaflet@1.9.4/"))return route.continue();
  if(url.startsWith("https://tile.openstreetmap.org/"))
   return route.fulfill({status:200,contentType:"image/png",body:Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")});
  outside.push(url);return route.abort();
 });
 try{
  await page.goto(base+"/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForURL("**/area.html",{timeout:10000});
  assert.equal(await page.locator("textarea").count(),1,"one simple text input");
  assert.equal(await page.locator(".go").count(),1,"one main action");
  assert.equal(await page.locator("#candidates").count(),0,"no property candidate identification");
  await page.locator("#example").click();
  assert.match(await page.locator("#advertisement").inputValue(),/ひばりが丘PARCO/);
  await page.locator("#search").click();
  await page.locator("#result").waitFor({state:"visible",timeout:20000});
  const summary=await page.locator("#summary").innerText();
  assert.match(summary,/2施設から約.*km²/);
  await page.waitForFunction(()=>document.querySelector("#map")?.dataset.state==="geographic-area-visible");
  const tileCount=await page.locator("#map .leaflet-overlay-pane path").count();
  assert.ok(tileCount>=9,"multiple 200m region cells on real geographic map");
  assert.ok(await page.locator("#map .leaflet-control-attribution").isVisible(),"OSM attribution is visible");
  assert.equal(await page.locator("#map .leaflet-marker-icon").count(),0,"no property pin");
  await page.screenshot({path:"area-smoke-artifacts/"+label+".png",fullPage:true});
  // Missing data is not a previous area's success.
  await page.locator("#advertisement").fill("未登録の駅 徒歩8分");
  await page.locator("#search").click();
  assert.equal(await page.locator("#result").isVisible(),false);
  assert.match(await page.locator("#errors").innerText(),/読み取れません/);
  await page.locator("#example").click();
  await page.locator("#search").click();
  await page.locator("#result").waitFor({state:"visible",timeout:10000});
  // No mobile horizontal overflow or silent script error.
  const overflow=await page.evaluate(()=>({
   page:document.documentElement.scrollWidth,
   width:document.documentElement.clientWidth
  }));
  assert.ok(overflow.page<=overflow.width+3,JSON.stringify(overflow));
  assert.deepEqual(errors,[]);
  assert.deepEqual(outside,[]);
  checks.push({label,summary,tiles:tileCount,restore:true,overflow:false,js_errors:0,unapproved_requests:0});
 }finally{await browser.close();}
}
try{
 await check(chromium,"chromium-desktop",{viewport:{width:1280,height:800}});
 await check(webkit,"webkit-mobile-emulation",{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 console.log(JSON.stringify({state:"PASS",checks,scope:"local browser engines only, not real iPhone hardware or accuracy"},null,2));
}catch(e){console.error(JSON.stringify({state:"FAIL",checks,error:String(e.stack||e)},null,2));process.exitCode=1;}
