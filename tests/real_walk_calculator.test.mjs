import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateDataset,evaluatePublicComplex,inspectGroup,metersBetween,decodePolyline6,routeRequestUrl,
  inspectRouteResponse,fetchWalkingRoute} from "../src/real_walk_calculator.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../examples/ur_real_pedestrian_routes_20261019.json",import.meta.url),"utf8"));
const copy=x=>JSON.parse(JSON.stringify(x));
const find=id=>fixture().cases.find(x=>x.case_id===id);

test("nine real pedestrian routes over four public UR complexes",()=>{
 const data=evaluateDataset(fixture());
 assert.equal(data.case_count,4);assert.equal(data.route_count,9);
 assert.equal(data.claim_accuracy,false);assert.equal(data.cases[0].overall_state,"research_only_not_verified");
});
test("Kamata gives 702m and 921m with 37m origin snapping",()=>{
 const a=evaluatePublicComplex(find("C01"));
 assert.deepEqual(a.groups.map(x=>x.rows[0].road_m),[702,921]);
 assert.deepEqual(a.groups.map(x=>x.rows[0].start_snap_m),[37,37]);
 assert.equal(a.summary.needs_review,2);
});
test("Mejiro is beyond nominal 7m upper by 30m",()=>{
 const r=evaluatePublicComplex(find("C02")).groups[0];
 assert.equal(r.band.upper_inclusive_m,560);assert.equal(r.rows[0].delta_outside_band_m,30);
 assert.equal(r.outcome,"reference_distance_differs");
});
test("Ikebukuro representative locations differ by 101m and are not cherry-picked",()=>{
 const r=evaluatePublicComplex(find("C02")).groups[1];
 assert.equal(r.reference_variation_m,101);
 assert.equal(r.outcome,"ambiguous_station_representatives");
 assert.deepEqual(r.rows.map(x=>x.road_m),[1002,1103]);
});
test("all Ogawamachi neighborhood sample routes are outside their narrow advertised bands",()=>{
 const a=evaluatePublicComplex(find("C03"));
 assert.deepEqual(a.groups.map(x=>x.rows[0].road_m),[239,339,282]);
 assert.ok(a.groups.every(x=>x.outcome==="reference_distance_differs"));
 assert.equal(a.summary.distance_differs,3);
});
test("Toyosu route 799m lies in the wide 7 to 12 minute experimental band",()=>{
 const r=evaluatePublicComplex(find("C04")).groups[0];
 assert.equal(r.band.lower_exclusive_m,480);assert.equal(r.band.upper_inclusive_m,960);
 assert.equal(r.outcome,"reference_band_near");
 assert.equal(r.validated_advertisement_match,false);
});
test("changing advertised time recomputes comparison without altering route observation",()=>{
 const c=find("C04");
 const base=evaluatePublicComplex(c).groups[0];
 const modified=evaluatePublicComplex(c,{toyosu:8}).groups[0];
 assert.equal(base.rows[0].road_m,modified.rows[0].road_m);
 assert.equal(modified.band.upper_inclusive_m,640);
 assert.equal(modified.rows[0].delta_outside_band_m,159);
 assert.equal(modified.outcome,"reference_distance_differs");
});
test("invalid walking overrides are rejected",()=>{
 assert.throws(()=>evaluatePublicComplex(find("C01"),{"jr-kamata":0}),/徒歩分数/);
 assert.throws(()=>evaluatePublicComplex(find("C01"),{"jr-kamata":"8"}),/徒歩分数/);
});
test("data reports no verified route, only public representative points",()=>{
 const a=evaluateDataset(fixture());
 for(const c of a.cases)for(const g of c.groups){
  assert.equal(g.validated_advertisement_match,false);
  assert.ok(g.reasons.includes("N02_station_reference_not_exit"));
  assert.ok(g.reasons.includes("GSI_address_reference_not_building_entrance"));
  assert.ok(g.reasons.includes("graph_version_unpinned"));
 }
});
test("smaller route distance than air distance (without snaps) rejected",()=>{
 const c=find("C04").conditions[0];
 const input=copy(c);input.targets[0].sample.road_m=10;
 assert.throws(()=>inspectGroup(input),/invalid/);
});
test("NaN source measurement is rejected",()=>{
 const c=find("C01").conditions[0];
 const input=copy(c);input.targets[0].sample.road_m=NaN;
 assert.throws(()=>inspectGroup(input),/invalid/);
});
test("coordinate distance in Kamata is near 105m",()=>{
 const d=metersBetween(find("C01").origin,[35.5621521775779,139.71541621040657]);
 assert.ok(d>100&&d<110);
});
test("invalid coordinate rejected",()=>assert.throws(()=>metersBetween([100,139],[35,139])));
test("Valhalla request uses pedestrian costing, kilometers, polyline6",()=>{
 const u=new URL(routeRequestUrl([35.5,139.5],[35.6,139.6]));
 const req=JSON.parse(u.searchParams.get("json"));
 assert.equal(req.costing,"pedestrian");assert.equal(req.units,"kilometers");
 assert.equal(req.shape_format,"polyline6");
 assert.deepEqual(req.locations,[{lat:35.5,lon:139.5},{lat:35.6,lon:139.6}]);
});
function encode(points){let lat=0,lon=0,s="";for(const p of points){
 const nlat=Math.round(p[0]*1e6),nlon=Math.round(p[1]*1e6);
 for(const d of [nlat-lat,nlon-lon]){let x=d<0?~(d<<1):(d<<1);while(x>=32){s+=String.fromCharCode((x&31|32)+63);x>>>=5} s+=String.fromCharCode(x+63);}
 lat=nlat;lon=nlon;
}return s}
test("decode polyline6 and inspect route geometry endpoints",()=>{
 const points=[[35.5,139.5],[35.5008,139.5007]];
 assert.deepEqual(decodePolyline6(encode(points)),points);
 const j={trip:{status:0,units:"kilometers",summary:{length:0.12,time:123.2},legs:[{shape:encode(points)}]}};
 const r=inspectRouteResponse(j,points[0],points[1]);
 assert.equal(r.road_m,120);assert.equal(r.snap_start_m,0);assert.equal(r.snap_end_m,0);
});
test("bad Valhalla units are rejected",()=>{
 const points=[[35.5,139.5],[35.5008,139.5007]];
 const j={trip:{status:0,units:"miles",summary:{length:0.12},legs:[{shape:encode(points)}]}};
 assert.throws(()=>inspectRouteResponse(j,points[0],points[1]),/invalid/);
});
test("fake API caller can calculate a new route from returned polyline",async()=>{
 const points=[[35.5,139.5],[35.5008,139.5007]];
 const mock=async (url,opts)=>{
  assert.ok(url.startsWith("https://valhalla1.openstreetmap.de/route?json="));
  assert.equal(opts.headers["X-Client-Id"],"github.com/moyashimisosoup/koredoko-research");
  return {ok:true,json:async()=>({trip:{status:0,units:"kilometers",
   summary:{length:0.12,time:89},legs:[{shape:encode(points)}]}})};
 };
 const r=await fetchWalkingRoute(points[0],points[1],mock);
 assert.equal(r.road_m,120);
});
test("routing API error is surfaced rather than silently inventing meters",async()=>{
 const p=[[35.5,139.5],[35.6,139.6]];
 await assert.rejects(()=>fetchWalkingRoute(p[0],p[1],async()=>({ok:false,status:429})),/HTTP 429/);
});
test("blank or oversized dataset must fail closed",()=>{
 assert.throws(()=>evaluateDataset({}),/Invalid dataset/);
 const d=fixture();d.cases=Array(21).fill(d.cases[0]);
 assert.throws(()=>evaluateDataset(d),/Invalid dataset/);
});
