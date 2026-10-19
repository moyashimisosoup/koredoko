import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewInput,evidenceValue} from "../src/input_review.mjs";

const fixture = () => JSON.parse(readFileSync(new URL("../examples/synthetic_listing_v0.2.json",import.meta.url),"utf8"));
const scan = (v, original="") => reviewInput(JSON.stringify(v),original);

test("synthetic listing has valid basic structure but evidence not source-verified",()=>{
  const r=scan(fixture());assert.equal(r.valid,true);
  assert.ok(r.warnings.some(x=>x.includes("未確認")));
});
test("passing identical excerpts verifies their existence, not geographic correctness",()=>{
  const d=fixture();
  const source=d.evidence.map(e=>e.verbatim_excerpt).join(" / ");
  const r=scan(d,source);
  assert.equal(r.valid,true);
  assert.equal(r.warnings.some(x=>x.includes("原文一致を未確認")),false);
});
test("invalid JSON is rejected",()=> assert.equal(reviewInput("{","").valid,false));
test("oversized JSON rejected",()=> assert.equal(reviewInput("x".repeat(200001)).valid,false));
test("missing source list rejected",()=>{
  const d=fixture();delete d.sources;assert.equal(scan(d).valid,false);
});
test("duplicate source IDs rejected",()=>{
  const d=fixture();d.sources.push({...d.sources[0]});assert.equal(scan(d).valid,false);
});
test("dangling evidence pointer rejected",()=>{
  const d=fixture();d.evidence[0].field_path="listing.stations[90].walk_minutes";assert.equal(scan(d).valid,false);
});
test("evidence source mismatch rejected",()=>{
  const d=fixture();d.evidence[0].source_id="fake";assert.equal(scan(d).valid,false);
});
test("empty explicit quote rejected",()=>{
  const d=fixture();d.evidence[0].verbatim_excerpt="";assert.equal(scan(d).valid,false);
});
test("quote not present in source rejected",()=>{
  const d=fixture();assert.equal(scan(d,"関係のない広告本文です").valid,false);
});
test("impossible walk minute rejected",()=>{
  const d=fixture();d.listing.stations[0].walk_minutes=-1;assert.equal(scan(d).valid,false);
});
test("not-walk-only station triggers caution",()=>{
  const d=fixture();d.listing.stations[0].travel_mode="bus_plus_walk";
  const r=scan(d);assert.equal(r.valid,true);assert.ok(r.warnings.some(x=>x.includes("徒歩距離")));
});
test("explicit evidence cannot access Object prototype",()=>{
  assert.equal(evidenceValue(fixture(),"listing.__proto__.constructor").found,false);
});
test("schema mismatch rejected",()=>{
  const d=fixture();d.schema_version="0.1";assert.equal(scan(d).valid,false);
});
test("AI inference cannot be promoted to verified fact",()=>{
  const d=fixture();d.evidence[0].kind="inferred";
  const r=scan(d);assert.equal(r.valid,true);assert.ok(r.warnings.some(x=>x.includes("推定")));
});
test("display HTML contains no external API call",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.equal(html.includes("src/input_review.mjs"),true);
  assert.equal(html.includes("textContent"),true);
  assert.equal(html.includes('fetch("./examples/synthetic_listing_v0.2.json"'),true);
  assert.equal(html.includes("https://api."),false);
});
