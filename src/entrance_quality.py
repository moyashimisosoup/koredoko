"""Research-only railway exit catalog QA; never infers a resident's address.

Separate (1) syntactic validity, (2) operator-confirmed exit identity,
(3) geographically independent position corroboration. A public route API
snapping onto a road is not independent verification of an exit coordinate.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from enum import Enum
from io import StringIO
from typing import Iterable

from accuracy_core import haversine_m
from route_quality import RouteAssessment, WalkAdGate, compare_advertised_walk


class EntranceGate(str, Enum):
    UNCHECKED = "unchecked"
    NAME_CHECKED = "name_checked"
    POSITION_REVIEW = "position_review"
    POSITION_CORROBORATED = "position_corroborated"


@dataclass(frozen=True)
class Entrance:
    exit_id: str
    station_id: str
    name: str
    lat: float
    lon: float
    source_url: str
    source_lineage: str
    source_revision: str
    survey_year: int | None = None


@dataclass(frozen=True)
class PositionEvidence:
    lat: float
    lon: float
    source_url: str
    source_lineage: str
    observed_on: date
    independently_collected: bool


@dataclass(frozen=True)
class EntranceCheck:
    gate: EntranceGate
    distance_between_sources_m: float | None
    reasons: tuple[str, ...]


def parse_exit_csv(csv_text: str, *, source_url: str, source_lineage: str,
                   source_revision: str, survey_year: int | None = None) -> list[Entrance]:
    """Read GTFS exit CSV without importing or publishing its raw rows."""
    if not all(isinstance(v, str) and v.strip() for v in (source_url, source_lineage, source_revision)):
        raise ValueError("source provenance missing")
    if survey_year is not None and (isinstance(survey_year, bool) or not 1900 <= survey_year <= date.today().year):
        raise ValueError("invalid survey year")
    if not isinstance(csv_text, str) or len(csv_text) > 4_000_000:
        raise ValueError("invalid CSV input")
    reader = csv.DictReader(StringIO(csv_text))
    required = {"stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ValueError("missing required GTFS fields")
    rows: list[Entrance] = []
    seen: set[str] = set()
    for row in reader:
        if None in row or row.get("location_type") != "2":
            raise ValueError("malformed or non-exit row")
        exit_id, station_id, name = [str(row[k] or "").strip() for k in ("stop_id", "parent_station", "stop_name")]
        if not all((exit_id, station_id, name)) or exit_id in seen:
            raise ValueError("missing or duplicated exit identity")
        lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
        haversine_m(lat, lon, lat, lon)
        seen.add(exit_id)
        rows.append(Entrance(exit_id, station_id, name, lat, lon, source_url,
                             source_lineage, source_revision, survey_year))
    if not rows:
        raise ValueError("no station exits")
    return rows


def audit_operator_exit_names(records: Iterable[Entrance], station_id: str,
                              operator_names: set[str]) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Check identity only. This never checks coordinate validity."""
    found = {r.name for r in records if r.station_id == station_id}
    if not found or not operator_names:
        return tuple(sorted(operator_names)), tuple(sorted(found))
    return tuple(sorted(operator_names - found)), tuple(sorted(found - operator_names))


def verify_exit_position(entrance: Entrance, *, name_confirmed_by_operator: bool,
                         alternative: PositionEvidence | None,
                         as_of: date, max_distance_m: float = 20.0,
                         max_evidence_age_days: int = 365 * 5) -> EntranceCheck:
    """Corroborate position with independent dated source (provisional 20m gate)."""
    if not name_confirmed_by_operator:
        return EntranceCheck(EntranceGate.UNCHECKED, None, ("operator_exit_name_unconfirmed",))
    if alternative is None:
        return EntranceCheck(EntranceGate.NAME_CHECKED, None, ("independent_coordinates_unavailable",))
    if not isinstance(max_distance_m, (int, float)) or isinstance(max_distance_m, bool) or not (0 < max_distance_m <= 100):
        raise ValueError("invalid tolerance")
    if not isinstance(max_evidence_age_days, int) or isinstance(max_evidence_age_days, bool) or max_evidence_age_days < 1:
        raise ValueError("invalid age limit")
    dist = haversine_m(entrance.lat, entrance.lon, alternative.lat, alternative.lon)
    reasons = []
    if not alternative.independently_collected or alternative.source_lineage == entrance.source_lineage:
        reasons.append("not_independent")
    if alternative.source_url == entrance.source_url or not alternative.source_url.strip():
        reasons.append("source_not_distinct")
    age = (as_of - alternative.observed_on).days
    if age < 0 or age > max_evidence_age_days:
        reasons.append("alternative_not_current")
    if dist > max_distance_m:
        reasons.append("position_disagreement")
    if reasons:
        return EntranceCheck(EntranceGate.POSITION_REVIEW, round(dist, 1), tuple(reasons))
    return EntranceCheck(EntranceGate.POSITION_CORROBORATED, round(dist, 1), ())


def compare_walk_with_entrance_checks(minutes: int, route: RouteAssessment,
                                      start_check: EntranceCheck, end_check: EntranceCheck,
                                      *, road_graph_version_pinned: bool) -> WalkAdGate:
    """Fail closed unless both endpoints and graph qualify."""
    entrances_ok = all(c.gate is EntranceGate.POSITION_CORROBORATED for c in (start_check, end_check))
    return compare_advertised_walk(minutes, route,
                                   entrances_independently_verified=entrances_ok,
                                   graph_provenance_verified=road_graph_version_pinned)
