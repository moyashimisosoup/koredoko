"""Property Locator accuracy design verification functions.

These deliberately never infer a real home's coordinates. Distances in meters.
"""

from enum import Enum
import math
from typing import Optional


class Decision(str, Enum):
    POSSIBLE = "possible"
    CONTRADICTION = "contradiction"
    REVIEW = "review"
    INVALID = "invalid"


class OutputState(str, Enum):
    VERIFIED_PUBLIC = "verified_public"
    CANDIDATE = "candidate"
    REGION = "region"
    ABSTAIN = "abstain"


def walk_advertisement_bounds(minutes: int) -> tuple[int, int]:
    """(exclusive_lower, inclusive_upper) based on advertising road distance."""
    if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes < 1 or minutes > 180:
        raise ValueError("walk_minutes must be an integer in [1,180]")
    return (minutes - 1) * 80, minutes * 80


def route_distance_consistency(minutes: int, road_meters: float) -> Decision:
    """Only for a validated entrance-to-entrance road distance; no tolerance model."""
    lo, hi = walk_advertisement_bounds(minutes)
    if not isinstance(road_meters, (int, float)) or isinstance(road_meters, bool) or not math.isfinite(road_meters) or road_meters < 0:
        return Decision.INVALID
    return Decision.POSSIBLE if lo < road_meters <= hi else Decision.CONTRADICTION


def straight_line_screen(minutes: int, straight_meters: float, tolerance_m: float = 0) -> Decision:
    """Only permits a negative geometrical screen; never proves a walking match.

    A contradictory lower-bound result must still trigger REVIEW, rather than
    automatic property-location elimination, when the ad or network is uncertain.
    """
    _, hi = walk_advertisement_bounds(minutes)
    for v in (straight_meters, tolerance_m):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
            return Decision.INVALID
    return Decision.CONTRADICTION if straight_meters > hi + tolerance_m else Decision.REVIEW


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    for lat, lng in ((lat1, lng1), (lat2, lng2)):
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in (lat, lng)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError("invalid geographic coordinates")
    r = 6371000.0
    a, b = math.radians(lat1), math.radians(lat2)
    da, dl = b - a, math.radians(lng2 - lng1)
    x = math.sin(da / 2)**2 + math.cos(a)*math.cos(b)*math.sin(dl/2)**2
    return 2*r*math.asin(min(1.0, math.sqrt(max(0.0,x))))


def poi_quality(*, name: str, lat: Optional[float], lng: Optional[float],
                admin_polygon_match: Optional[bool], has_source: bool = True) -> Decision:
    """Administrative review requires independently checked polygon membership.

    A mere mismatch of city strings must NOT be passed as polygon mismatch.
    """
    try:
        haversine_m(lat, lng, lat, lng)
    except (ValueError, TypeError):
        return Decision.INVALID
    if not isinstance(name, str) or not name.strip() or not has_source:
        return Decision.REVIEW
    if admin_polygon_match is False or admin_polygon_match is None:
        return Decision.REVIEW
    return Decision.POSSIBLE


def result_state(*, independent_public_identification: bool,
                 official_public_location: bool,
                 provenance_complete: bool, candidate_count: Optional[int],
                 region_computable: bool, unresolved_critical_conflict: bool) -> OutputState:
    """Conservative gating, with verified never inferred by ranking alone."""
    if unresolved_critical_conflict or not provenance_complete:
        return OutputState.ABSTAIN
    if independent_public_identification and official_public_location:
        return OutputState.VERIFIED_PUBLIC
    if candidate_count is not None and candidate_count > 0:
        return OutputState.CANDIDATE
    if region_computable:
        return OutputState.REGION
    return OutputState.ABSTAIN
