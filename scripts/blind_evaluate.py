"""Post-prediction comparison against publicly geocoded UR address references.

Never interprets a GSI address coordinate as a building's surveyed entrance.
The locked estimator's source file and fixed input file are not edited here.
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from blind_envelope import compute_envelope, contains_reference_point
from accuracy_core import haversine_m


def evaluate():
    inputs = json.loads((ROOT/"examples/blind_poi_inputs_20261019.json").read_text(encoding="utf8"))
    heldout = json.loads((ROOT/"examples/blind_holdout_gsi_references_20261019.json").read_text(encoding="utf8"))
    gold = {r["id"]:r for r in heldout["records"]}
    if len(gold)!=len(inputs["cases"]) or len(heldout["records"])!=len(gold):
        raise ValueError("ground truth record mismatch")
    results = []
    for case in inputs["cases"]:
        reference=gold[case["id"]]
        predicted=[]
        for buffer in inputs["scenarios_m"]:
            env=compute_envelope(case["groups"],buffer_m=buffer,grid_m=inputs["grid_m"])
            inside=contains_reference_point(env,reference["reference_lat"],reference["reference_lng"])
            distances=[]
            for group in case["groups"]:
                distance=min(haversine_m(reference["reference_lat"],reference["reference_lng"],rep["lat"],rep["lng"])
                             for rep in group["representatives"])
                distances.append({
                    "station_key":group["station_key"],
                    "nearest_station_representative_direct_m":round(distance,1),
                    "nominal_max_m":group["max_walk_minutes"]*80+buffer,
                    "within_nominal_radius":distance <=group["max_walk_minutes"]*80+buffer
                })
            predicted.append({
                "buffer_m":buffer, "block_reference_inside_nominal_envelope":inside,
                "area_km2":round(env["estimated_area_m2"]/1e6,5),
                "baseline_single_station_area_km2":round(env["single_station_baseline_area_m2"]/1e6,5),
                "station_checks":distances
            })
        results.append({"case_id":case["id"],"official_complex":reference["public_housing_name"],
                        "matched_gsi_precision":reference["matched_level"],
                        "source_url":reference["official_ad"],"checks":predicted})
    return {
        "method":"blind-nominal-grid-v0.1",
        "locked_prediction_sha":heldout["prediction_locked_commit"],
        "sample_count":len(results),
        "strict_inside_count":sum(x["checks"][0]["block_reference_inside_nominal_envelope"] for x in results),
        "sensitivity_inside_count":sum(x["checks"][1]["block_reference_inside_nominal_envelope"] for x in results),
        "interpretation":"GSI address reference-point inclusion only; not building / entrance coverage or statistically measured location accuracy",
        "cases":results
    }


if __name__=="__main__":
    print("HELDOUT_EVALUATION_JSON="+json.dumps(evaluate(),ensure_ascii=False,separators=(",",":")))
