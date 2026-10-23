import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildListingExtractionPrompt} from "../src/url_prompt_builder.mjs";
test("listing URL yields copyable real-page AI request without inventing advertisement evidence",()=>{
 const url="https://example.com/property/detail?listing=123&view=sp";
 const prompt=buildListingExtractionPrompt(url);
 assert.ok(prompt.includes(url));
 assert.match(prompt,/閲覧できない|読めない|アクセスできなかった/);
 assert.match(prompt,/ひばりが丘郵便局：徒歩2分/);
 assert.match(prompt,/確認事項/);
 assert.match(prompt,/広告にない/);
 assert.ok(!prompt.includes("[[URL]]"));
});
test("untrusted and malformed URL rejected without fetching",()=>{
 for(const url of ["","file:///etc/passwd","javascript:alert(1)","https://user:password@example.org/a","example.com/detail","https://a.example/\nsecret"]){
  assert.throws(()=>buildListingExtractionPrompt(url),/URL/);
 }
 assert.ok(!buildListingExtractionPrompt("https://example.org/a#secret").includes("#secret"));
});
test("minimal URL-to-copy UI remains independent from AI API and area search",()=>{
 const h=readFileSync(new URL("../area.html",import.meta.url),"utf8");
 for(const id of ["listing-url","make-prompt","prompt-result","ai-prompt","copy-prompt","advertisement","search","map"])
  assert.ok(h.includes('id="'+id+'"'),id);
 assert.equal((h.match(/<textarea /g)||[]).length,1);
 assert.ok(h.includes("buildListingExtractionPrompt"));
 assert.ok(h.includes("navigator.clipboard.writeText(generatedPrompt)"));
 assert.ok(h.includes('el("prompt-result").classList.add("hidden")'));
 assert.ok(!h.includes("api.openai.com"));
 assert.ok(!h.includes("fetch(el(\"listing-url\")"));
});
