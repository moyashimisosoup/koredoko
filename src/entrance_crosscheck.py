"""R06: audit paired public subway exits without inferring source independence.

The geographical closeness of a second map point proves only consistency, not
the accuracy, lineage independence, or current existence of a subway entrance.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math
from statistics import median
from typing import Any

from accuracy_core import haversine_m


class PairStatus(str, Enum):
    COORDINATE_AGREEMENT_ONLY = "coordinate_agreement_only"
    POSITION_DISAGREEMENT = "position_disagreement"
    IDENTITY_UNRESOLVED = "identity_unresolved"
    MALFORMED = "malformed"


@dataclass(frozen=True)
class ExitPairResult:
    key: str
    status: PairStatus
    difference_m: float | None
    independently_verified: bool
    reasons: tuple[str, ...]


def audit_pair(record: dict[str, Any], *, review_distance_m: float = 20.0) -> ExitPairResult:
    """Review a human-curated exit match, with fail-closed provenance.

    OSM node history names/refs are acceptable *identity hints* only.
    External aerial imagery and a differing user/edit date DO NOT by themselves
    prove that the original point measurements have independent lineage.
    """
    key = str(record.get("key", "unknown"))
    invalid = ExitPairResult(key, PairStatus.MALFORMED, None, False, ("invalid_record",))
    try:
        if isinstance(review_distance_m, bool) or not isinstance(review_distance_m, (float, int)) or not math.isfinite(review_distance_m) or review_distance_m <= 0:
            return invalid
        old, osm = record["legacy"], record["osm"]
        # Basic provenance is mandatory, but does not imply independent measurement.
        for item, attributes in (
            (old, ("lat", "lon", "record_id", "source_revision")),
            (osm, ("lat", "lon", "node_id", "first_seen", "changeset_id")),
        ):
            if not all(item.get(field) not in (None, "") for field in attributes):
                return invalid
        if not isinstance(record.get("official_station"), str) or not record["official_station"]:
            return invalid
        if str(osm["node_id"]) == str(old["record_id"]):
            return invalid
        a = (old["lat"], old["lon"])
        b = (osm["lat"], osm["lon"])
        distance = haversine_m(*a, *b)
        if record.get("identity_match") not in ("osm_ref", "osm_historical_name"):
            return ExitPairResult(key, PairStatus.IDENTITY_UNRESOLVED, round(distance, 2),
                                  False, ("exit_identity_unverified",))
        # Crucially, no automatic inference of independence or true position.
        # Explicitly ban automatic promotion even if source URLs differ.
        if distance > review_distance_m:
            return ExitPairResult(key, PairStatus.POSITION_DISAGREEMENT, round(distance, 2),
                                  False, ("position_exceeds_review_threshold", "independence_unconfirmed"))
        return ExitPairResult(key, PairStatus.COORDINATE_AGREEMENT_ONLY, round(distance, 2),
                              False, ("measurement_lineage_unverified", "operator_georeference_unverified"))
    except (TypeError, ValueError, KeyError, OverflowError):
        return invalid


def audit_collection(entries: list[dict[str, Any]], *, review_distance_m: float = 20.0) -> dict[str, Any]:
    """Reject duplicated reference identities and report only audit statistics."""
    if not isinstance(entries, list) or not entries:
        raise ValueError("no comparison entries")
    keys = [entry.get("key") for entry in entries]
    node_ids = [entry.get("osm", {}).get("node_id") for entry in entries]
    old_ids = [entry.get("legacy", {}).get("record_id") for entry in entries]
    if any(not key for key in keys + node_ids + old_ids):
        raise ValueError("missing identity")
    if len(set(keys)) != len(keys) or len(set(node_ids)) != len(node_ids) or len(set(old_ids)) != len(old_ids):
        raise ValueError("duplicate exit pair identity")
    checks = [audit_pair(entry, review_distance_m=review_distance_m) for entry in entries]
    distances = [r.difference_m for r in checks if r.difference_m is not None]
    return {
        "n_pairs": len(checks),
        "counts": {status.value: sum(r.status == status for r in checks) for status in PairStatus},
        "mean_difference_m": round(sum(distances) / len(distances), 2) if distances else None,
        "median_difference_m": round(median(distances), 2) if distances else None,
        "max_difference_m": max(distances) if distances else None,
        "independently_verified_count": sum(r.independently_verified for r in checks),
        "results": checks,
    }
