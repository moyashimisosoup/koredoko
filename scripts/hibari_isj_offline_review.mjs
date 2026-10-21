#!/usr/bin/env node
/** Manual offline ISJ review. Does not retrieve ZIP or call remote APIs.
 * Usage:
 *   node scripts/hibari_isj_offline_review.mjs /path/to/ISJ_STREETBLOCK.csv 2025
 * Upstream CSV: https://nlftp.mlit.go.jp/isj/
 * Requires prior acceptance of the site's downloadable dataset terms.
 */
import {readFileSync} from "node:fs";
import {basename} from "node:path";
import {createHash} from "node:crypto";
import {parseIsjBlocks,matchPublicBlockAddresses} from "../src/hibari_offline_isj_match.mjs";
const [,,source,year]=process.argv;
if(!source||!year||!Number.isInteger(Number(year)))throw Error("Provide CSV filename and edition year");
const bytes=readFileSync(source);
if(bytes.length>250_000_000)throw Error("File exceeds review limit");
const text=new TextDecoder("shift_jis",{fatal:true}).decode(bytes);
const sourceRows=parseIsjBlocks(text);
const load=x=>JSON.parse(readFileSync(new URL("../examples/"+x,import.meta.url),"utf8"));
const result=matchPublicBlockAddresses(
 load("hibari_public_building_addresses_20261021.json"),
 load("hibari_poi_identities_20261021.json"),
 sourceRows,{datasetYear:Number(year),fileName:basename(source)});
result.source_sha256=createHash("sha256").update(bytes).digest("hex");
result.imported_at_utc=new Date().toISOString();
result.source_discarded_rows=sourceRows.discarded;
result.notice="Manual review only, representative blocks are NOT building doors; license attribution required.";
process.stdout.write(JSON.stringify(result,null,2)+"\n");