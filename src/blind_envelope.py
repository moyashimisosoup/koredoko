"""APP-023 predeclared nominal station-distance envelope, research only.

Input deliberately cannot include housing coordinates, street address or complex name.
Physical station references are deduplicated; alternative representative station
coordinates are combined as a UNION (not an erroneous multiple-station intersection).
There is no claim of position accuracy, entrance verification, or route distance.
"""

from __future__ import annotations

import math
from typing import Any

M_PER_DEG_LAT = 111195.0


def _validate(groups: list[dict[str, Any]], buffer_m: float, grid_m: int):
    if not isinstance(groups, list) or not groups:
        raise ValueError("requires station groups")
    if isinstance(buffer_m, bool) or not isinstance(buffer_m, (int, float)) or not math.isfinite(buffer_m) or not (0 <= buffer_m <= 300):
        raise ValueError("buffer outside preregistered 0-300m sensitivity range")
    if isinstance(grid_m, bool) or grid_m not in (25, 50):
        raise ValueError("grid must be 25m or 50m")
    used = set()
    for group in groups:
        key=group.get("station_key")
        if not isinstance(key,str) or not key or key in used:
            raise ValueError("station keys must be unique")
        used.add(key)
        m=group.get("max_walk_minutes")
        if isinstance(m,bool) or not isinstance(m,int) or not (1 <= m <= 180):
            raise ValueError("must use positive integer upper advertised minutes")
        candidates=group.get("representatives")
        if not isinstance(candidates,list) or not candidates:
            raise ValueError("station needs a representative")
        for c in candidates:
            lat, lon = c["lat"], c["lng"]
            if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (lat,lon)):
                raise ValueError("invalid station coordinate")
            if not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise ValueError("out-of-range coordinate")


def compute_envelope(groups: list[dict[str, Any]], *, buffer_m: float = 0, grid_m: int = 25) -> dict[str, Any]:
    """Return reproducible nominal area and an exact point-membership predicate's parameters.

    Square grid cells sample the region; area estimate is quantized, and must not
    be interpreted as a calibrated confidence polygon. No ground-truth input.
    """
    _validate(groups,buffer_m,grid_m)
    lat0=sum(c["lat"] for g in groups for c in g["representatives"])/sum(len(g["representatives"]) for g in groups)
    lon0=sum(c["lng"] for g in groups for c in g["representatives"])/sum(len(g["representatives"]) for g in groups)
    scale_x=M_PER_DEG_LAT*math.cos(math.radians(lat0))
    if scale_x < 100:
        raise ValueError("cannot project near pole")
    def project(c):
        return ((c["lng"]-lon0)*scale_x,(c["lat"]-lat0)*M_PER_DEG_LAT)
    projected=[]
    for group in groups:
        projected.append({"station_key":group["station_key"],
                          "radius_m":group["max_walk_minutes"]*80+buffer_m,
                          "centers_xy":[project(c) for c in group["representatives"]]})
    start=projected[0]
    xmin=min(c[0]-start["radius_m"] for c in start["centers_xy"])
    xmax=max(c[0]+start["radius_m"] for c in start["centers_xy"])
    ymin=min(c[1]-start["radius_m"] for c in start["centers_xy"])
    ymax=max(c[1]+start["radius_m"] for c in start["centers_xy"])
    def inside(x,y):
        return all(any((x-a)**2+(y-b)**2<=g["radius_m"]**2 for a,b in g["centers_xy"]) for g in projected)
    nx=math.ceil((xmax-xmin)/grid_m)
    ny=math.ceil((ymax-ymin)/grid_m)
    if nx*ny>3_000_000:
        raise ValueError("search region too large for research implementation")
    count=sum(inside(xmin+(i+.5)*grid_m,ymin+(j+.5)*grid_m) for i in range(nx) for j in range(ny))
    return {
        "method_version":"blind-nominal-grid-v0.1",
        "buffer_m":buffer_m, "grid_m":grid_m, "candidate_cell_count":count,
        "estimated_area_m2":count*grid_m*grid_m,
        "single_station_baseline_area_m2":round(math.pi*start["radius_m"]**2),
        "station_group_count":len(projected),
        "distinct_physical_stations":len(projected),
        "station_representative_count":sum(len(g["centers_xy"]) for g in projected),
        "projection_lat0":lat0,"projection_lon0":lon0,
        "projection_m_per_deg_x":scale_x,
        "ranges":projected,
        "contains_point_not_ground_truth":False,
        "limitations":["straight_line_only","station_centers_not_verified_entrances",
                       "grid_estimated_area","no_building_footprints","not_calibrated"]
    }


def contains_reference_point(envelope: dict[str,Any], lat:float, lon:float) -> bool:
    """Evaluate held-out block representative point ONLY after prediction is fixed."""
    if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (lat,lon)):
        raise ValueError("invalid point")
    if not (-90<=lat<=90 and -180<=lon<=180):
        raise ValueError("out-of-bounds point")
    x=(lon-envelope["projection_lon0"])*envelope["projection_m_per_deg_x"]
    y=(lat-envelope["projection_lat0"])*M_PER_DEG_LAT
    return all(any((x-a)**2+(y-b)**2 <= g["radius_m"]**2 for a,b in g["centers_xy"])
               for g in envelope["ranges"])
