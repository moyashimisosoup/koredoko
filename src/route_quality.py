"""Auditable pedestrian-route sanity checks for the property-locator research PoC.

No method in this module can verify a property or person, and no numeric route
comparison should be treated as a confirmed advertising violation without
independently verified public entrance points and a qualified road graph.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
import math
from typing import Any

from accuracy_core import haversine_m, walk_advertisement_bounds


class RouteGate(str, Enum):
    PROVISIONAL = "provisional"
    REVIEW = "review"
    INVALID = "invalid"


class WalkAdGate(str, Enum):
    UNRESOLVED = "unresolved"
    COMPATIBLE = "compatible"
    INCOMPATIBLE = "incompatible"


@dataclass(frozen=True)
class RouteAssessment:
    gate: RouteGate
    road_m: float | None
    direct_m: float | None
    ratio: float | None
    start_snap_m: float | None
    end_snap_m: float | None
    reasons: tuple[str, ...]


def decode_polyline6(value: str) -> list[tuple[float, float]]:
    """Decode Valhalla's polyline6 to a (latitude, longitude) sequence."""
    if not isinstance(value, str) or not value or len(value) > 1_000_000:
        raise ValueError("invalid polyline")
    out, idx, lat, lon = [], 0, 0, 0
    while idx < len(value):
        deltas = []
        for _ in range(2):
            shift, accum = 0, 0
            while True:
                if idx >= len(value) or shift > 35:
                    raise ValueError("truncated/oversized polyline")
                b = ord(value[idx]) - 63
                idx += 1
                if not (0 <= b <= 63):
                    raise ValueError("invalid polyline alphabet")
                accum |= (b & 31) << shift
                if b < 32:
                    break
                shift += 5
            deltas.append((~(accum >> 1) if accum & 1 else accum >> 1))
        lat += deltas[0]
        lon += deltas[1]
        point = (lat / 1_000_000, lon / 1_000_000)
        haversine_m(*point, *point)
        out.append(point)
    if len(out) < 2:
        raise ValueError("polyline requires at least two coordinates")
    return out


def assess_pedestrian_route(response: dict[str, Any], start: tuple[float, float],
                            end: tuple[float, float], *, snap_review_m: float = 25) -> RouteAssessment:
    """Check Valhalla JSON; never claim external ground truth.

    A 25m snapping threshold is an exploratory review trigger, not calibrated.
    Caller validates request costing=pedestrian and units=kilometers.
    """
    invalid = RouteAssessment(RouteGate.INVALID, None, None, None, None, None, ("unusable_response",))
    try:
        if not math.isfinite(snap_review_m) or snap_review_m <= 0:
            return invalid
        direct = haversine_m(*start, *end)
        trip = response["trip"]
        if trip.get("status") != 0 or trip.get("units") != "kilometers":
            return invalid
        length_km = trip["summary"]["length"]
        if isinstance(length_km, bool) or not isinstance(length_km, (int, float)) or not math.isfinite(length_km) or length_km <= 0:
            return invalid
        route_m = length_km * 1000
        shape = trip["legs"][0]["shape"]
        points = decode_polyline6(shape)
        start_snap = haversine_m(*start, *points[0])
        end_snap = haversine_m(*end, *points[-1])
        ratio = route_m / direct if direct > 0 else None
        reasons = []
        if route_m + start_snap + end_snap + 3 < direct:
            return RouteAssessment(RouteGate.INVALID, round(route_m,1), round(direct,1),ratio,
                                   round(start_snap,1),round(end_snap,1),("geometrically_impossible",))
        if start_snap > snap_review_m or end_snap > snap_review_m:
            reasons.append("endpoint_snapping_exceeds_review_threshold")
        if direct < 1:
            reasons.append("degenerate_original_points")
        gate = RouteGate.REVIEW if reasons else RouteGate.PROVISIONAL
        return RouteAssessment(gate, round(route_m,1),round(direct,1),round(ratio,3) if ratio else None,
                               round(start_snap,1),round(end_snap,1),tuple(reasons))
    except (ValueError, TypeError, KeyError, IndexError, OverflowError):
        return invalid


def compare_advertised_walk(minutes: int, route: RouteAssessment, *,
                            entrances_independently_verified: bool = False,
                            graph_provenance_verified: bool = False,
                            error_buffer_m: float = 25) -> WalkAdGate:
    """Only compare advertised distances after external QA gates.

    The buffer is provisional and not an empirically calibrated uncertainty interval.
    Within the band of either boundary, abstain.
    """
    lower, upper = walk_advertisement_bounds(minutes)
    if route.gate != RouteGate.PROVISIONAL or not entrances_independently_verified or not graph_provenance_verified:
        return WalkAdGate.UNRESOLVED
    if not isinstance(error_buffer_m, (int,float)) or isinstance(error_buffer_m,bool) or not math.isfinite(error_buffer_m) or error_buffer_m < 0:
        return WalkAdGate.UNRESOLVED
    d = route.road_m
    if d is None or abs(d-lower) <= error_buffer_m or abs(d-upper) <= error_buffer_m:
        return WalkAdGate.UNRESOLVED
    return WalkAdGate.COMPATIBLE if lower < d <= upper else WalkAdGate.INCOMPATIBLE
