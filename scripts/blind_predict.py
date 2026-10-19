"""Emit held-out-input-only predictions to GitHub Actions logs before truth access."""
from __future__ import annotations
import json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from blind_envelope import compute_envelope

def predict():
    f=json.loads((ROOT/"examples/blind_poi_inputs_20261019.json").read_text(encoding="utf8"))
    out=[]
    for case in f["cases"]:
        record={"case_id":case["id"],"num_groups":len(case["groups"]), "predictions":[]}
        for buffer_m in f["scenarios_m"]:
            e=compute_envelope(case["groups"],buffer_m=buffer_m,grid_m=f["grid_m"])
            record["predictions"].append({
                "buffer_m":buffer_m,
                "candidate_cells":e["candidate_cell_count"],
                "area_km2":round(e["estimated_area_m2"]/1e6,5),
                "first_station_baseline_km2":round(e["single_station_baseline_area_m2"]/1e6,5),
                "relative_area_fraction":round(e["estimated_area_m2"]/e["single_station_baseline_area_m2"],4),
                "status":"nonempty" if e["candidate_cell_count"] else "no_feasible_nominal_area"
            })
        out.append(record)
    return {"method":f["algorithm_version"],"reference_coordinates_used":False,
            "grid_m":f["grid_m"],"cases":out}

if __name__=="__main__":
    print("BLIND_PREDICTIONS_JSON="+json.dumps(predict(),ensure_ascii=False,separators=(",",":")))
